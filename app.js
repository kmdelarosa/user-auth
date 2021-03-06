var settings = require('./settings.js');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var sqlite3 = require('sqlite3');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var bcrypt = require('bcrypt');
const saltRounds = 10;

// initialize database
var file = path.join(settings.app.db);
fs.existsSync(file);
var db = new sqlite3.Database(file);

// initialize db table for admin users
db.run("CREATE TABLE IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, password TEXT, permissions TEXT )", function(err) {
    if(err) { console.log(err); }
    db.get("SELECT user from users", function(err, row) {
      if(err) { console.log(err); }
      if(!row) {
        bcrypt.hash(settings.app.defaultpass, saltRounds, function(err, hash) {
          db.run("INSERT INTO users ( user, password, permissions ) VALUES( ?, ?, 'super' )", settings.app.defaultuser, hash, function(err) {
            if(err) { console.log(err); }
          });
        });
      }
    });
});

// db functions
var createUser = function(req, res) {
  var user = req.body.user;
  db.get('SELECT user FROM users WHERE user = ?', user, function(err, row) {
    // if(err)
    if(row) {
      req.flash('errorMessage', 'There is already a user with that name.');
      // res.redirect('/admin/users');
    } else {
      bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
        db.run('INSERT INTO users ( user, password ) VALUES( ?, ? )', user, hash, function(err) {
          // if(err)
          if(this.lastID) {
            req.flash('successMessage', 'User created!');
            // res.redirect('/admin/users');
          } else {
            req.flash('errorMessage', 'Apologies, it seems something went wrong.');
            // res.redirect('/admin/users');
          }
        });
      });
    }
  });
}

var deleteUser = function(req, res) {
  if(req.user.user === req.body.user) {
    req.flash('errorMessage', "You can't delete yourself.");
    // res.redirect('/admin/users');
  } else {
    db.run('DELETE FROM users WHERE user = ?', req.body.user, function(err) {
      if(err) {
        //...
      } else {
        req.flash('successMessage', 'User deleted!');
        // res.redirect('/admin/users');
      }
    });
  }
}

// setting up user authentication
passport.use(new LocalStrategy({ usernameField: 'user' }, function(user, password, done) {
  db.get('SELECT password FROM users WHERE user = ?', user, function(err, row) {
    if (!row) return done(null, false);
    bcrypt.compare(password, row.password, function(err, res) {
      if(!res) return done(null, false);
      db.get('SELECT user, id FROM users WHERE user = ?', user, function(err, row) {
        return done(null, row);
      });
    });
  });
}));

passport.serializeUser(function(user, done) {
  return done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  db.get('SELECT id, user FROM users WHERE id = ?', id, function(err, row) {
    if (!row) { return done(null, false); }
    return done(null, row);
  });
});

// setting up the app
var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var SQLiteStore = require('connect-sqlite3')(session);
var flash = require('express-flash');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');

var app = express();
// bodyParser to let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cookieParser('secret'));
app.use(session({
  store: new SQLiteStore,
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

app.engine('handlebars', exphbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

app.use(express.static('public'));

app.post('/login', passport.authenticate('local', {
    failureRedirect: '/'
  }), function(req, res) {
    res.redirect('/');
  }
);

app.post('/logout', function(req, res) {
	req.session.destroy(function(err) {
		res.redirect('/');
	})
});

app.get('/', function(req, res) {
		res.render('home',{
			user:req.user
		});
});

app.post('/user', function(req, res) {
  if (req.user) {
    switch(req.body["_method"]) {
      case "DELETE":
        deleteUser(req, res);
      break;
      case "PUT":
        // ...
      break;
      default:
        createUser(req, res);
      break;
    }
  } else { res.redirect('/admin'); }
});

app.listen(settings.app.port, function() {
  console.log('app listening on port ' + settings.app.port);
});
