const express = require('express');
const request = require('request');
const bodyParser= require('body-parser');
const app = express();
const MongoClient = require('mongodb').MongoClient
const cookieParser = require('cookie-parser');
var ObjectId = require('mongodb').ObjectID;
var session = require('cookie-session');
var popup = require('window-popup').windowPopup;
const crypto = require("crypto");
var loggedIn = false;
var url = require('./config.json');
var db

app.use(express.static(__dirname + "/views/"));
app.set('view engine', 'ejs')
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
  secret: "A secret key",
  resave: false,
  saveUninitialized: true,
}));

// connect to the database
MongoClient.connect(url, (err, database) => {
  if (err) return console.log(err)
  db = database
  app.listen(process.env.PORT || 8000, () => {
    console.log('listening on 8000')
  })
})
var userSessionId = "undefined";

/* General API code */

// this takes you to home page
app.get('/', (req, res) => {
  db.collection('reviews').find().toArray((err, result) => {
    if (err) return console.log(err)
    if (loggedIn) {
      userSessionId = req.session.user.id;
    }
    res.render('chooseUniversity.ejs', {reviews: result, myVar: "", loggedIn: loggedIn, userName: userSessionId})
  })
})

//Gets universities based on country name
app.get('/universities/:Country', (req, res) => {
  request.get('http://universities.hipolabs.com/search?country=' + req.params.Country,
    (err, resp, body) => {
      res.send(body);
    })
})

// this brings you to page with specific courses & reviews for a university
app.get('/university/:uniName', (req, res) => {
  // req.params.uniName is the name of university we selected
  // query 'courses' to find all courses that have been added for this uni

  var courseToRating = new Array();
  db.collection('courses').find({ university: req.params.uniName }).toArray((err, result) => {
    if (err) return console.log(err)

    // query to find all reviews for this uni
    db.collection('reviews').find({ university: req.params.uniName }).toArray((err2, result2) => {
      if (err) return console.log(err)

      // calculate the average rating for each course
      for (var i=0; i<result.length; i++) {
        var sum = 0;
        var numReviews = 0;
        for (var j=0; j<result2.length; j++) {
          if (result[i].coursecode == result2[j].coursecode) {
            sum += parseInt(result2[j].rating);
            numReviews++;
          }
        }
        if (numReviews != 0) {
          var average = sum / numReviews;
        } else {
          var average = 0;
        }
        courseToRating[result[i].coursecode] = Math.floor(average);
      }
      res.render('university.ejs', {courses: result, reviews: result2, uniName: req.params.uniName, userName: userSessionId, courseToRating: courseToRating})
    });
  });
})

// submit a review
app.post('/reviews', checkSignIn, (req, res, next) => {
  db.collection('reviews').save(req.body, (err, result) => {
    if (err) return console.log(err)
    console.log('saved to database')
    console.log(req.body);
    // refresh current page
    res.redirect('/university/' + req.body.university)
  })
})

app.post('/courses', (req, res) => {
  db.collection('courses').save(req.body, (err, result) => {
    if (err) return console.log(err)
    console.log('saved course to database')

    // refresh page after adding a course
    res.redirect('/university/' + req.body.university)
  })
})

// Updates a review
app.get("/university/:reviewId/edit", (req, res) => {
  db.collection('reviews').find({"_id": ObjectId(req.params.reviewId)}).toArray((err, result) => {
    if (err) return console.log(err)
    res.render('edit.ejs', {review: result})
  })
});

app.post("/reviews/:reviewId", (req, res) => {
  db.collection('reviews').update(
   { "_id": ObjectId(req.params.reviewId) },
   {
      university: req.body.university,
      rating: req.body.rating,
      review: req.body.review,
      user: req.body.user,
      coursecode: req.body.coursecode
   }
  )
  res.redirect('/university/' + req.body.university)

});

// Deletes a review
app.post('/university/review/:reviewId', (req, res) => {
  //Send the _id of the review to be deleted from frontend somehow
  db.collection('reviews').deleteOne({"_id": ObjectId(req.params.reviewId)}, (err, result) => {
    if(err) return console.log(err)
    console.log('successfully deleted review')
    res.redirect('/university/' + req.body.university)
  })
})


/* Session Management Code*/

//Sign up form
app.post('/signup', (req, res) =>{
  var username = req.body.username
  var password = req.body.password

  db.collection('users').findOne({username: username, password: password}, (err, user) => {
    if(err){
      console.log(err);
    }
    if(user){
      res.send("user already exists");
    } else {
      db.collection('users').insertOne(req.body, (err, result) => {
        if (err) return console.log(err)
        console.log("Signup complete!")
        res.redirect('/');
      })
    }
  })
})

app.get('/signup', (req, res) => {
  res.render('signup.ejs');
})

app.get('/login', (req, res) => {
  res.render('login.ejs');
})

//Log in form
app.post('/login', (req, res) => {
  var username = req.body.username
  var password = req.body.password

  db.collection('users').findOne({username: username, password: password}, (err, user) => {
    if(err){
      console.log(err);
    }
    if(user){
      var newUser = {id: req.body.username, password: req.body.password};
      req.session.user = newUser;
      loggedIn = true;
      res.redirect('/');
    } else {
      // req.session.user = user;
      res.send("Invalid username and password");
    }
  })
})

//Logout form
app.post('/logout', function(req, res){
   req.session = null;
   userSessionId = "undefined";
   loggedIn = false;
   res.redirect('/');
});

// Checks if the user signed in
function checkSignIn(req, res, next){
  if(req.session.user){
    if(req.session.user.id == "undefined"){
      res.redirect('/')
    } else {
          next();
    }

  } else {
    var err = new Error("Not logged in!");
    console.log(req.session.user);
    res.redirect('/')
  }
}

