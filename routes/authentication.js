const express = require("express");
const router = express.Router();
// dependencies
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const SALT = 10;
const AWS = require("aws-sdk");
AWS.config.update({
  region: "us-east-2",
});

// serving POST request for user signup
router.post("/signup", (request, response) => {
  request.body.email = request.body.email.trim();
  request.body.password = request.body.password.trim();
  request.body.username = request.body.username.trim();
  request.body.username = request.body.username.toLowerCase();
  // check if the username already exist in db or not ?
  DynamoDB.get({
    TableName: "users",
    Key: { username: request.body.username },
    ConsistentRead: true,
    ProjectionExpression: "username",
  })
    .promise()
    .then((data) => {
      if (data.Item != null) {
        response.send(
          `Username ${data.Item.username} already exists in USERS table at DynamoDB`
        );
        response.end();
      } else {
        console.log("This username is available. Inserting new user.......");
        // hashing user password
        let hashedPassword = bcrypt.hashSync(request.body.password, SALT);
        // schema for document to insert into USER.DB
        let user = {
          username: request.body.username.toLowerCase(),
          password: hashedPassword,
          friends: [],
          gender: request.body.gender,
          emails: [{ address: request.body.email, primary: true }],
          mobile: [],
        };
        //storing user
        DynamoDB.put({ Item: user, TableName: "users" })
          .promise()
          .then((data) => {
            console.log("New user signed up successfully");
            response.redirect("/");
          })
          .catch((error) => {
            response.send("Error occurred while writing data to users table");
            response.end();
          });
      }
    })
    .catch((error) => {
      console.log("Error occurred. Please try again later");
    });
});

router.post("/login", (request, response) => {
  request.body.username = request.body.username.toLowerCase();
  // check if the user exists or not
  DynamoDB.get({
    TableName: "users",
    Key: { username: request.body.username },
    ConsistentRead: true,
    ProjectionExpression: "username, password",
  })
    .promise()
    .then((data) => {
      if (data.Item != null) {
        //this username exists
        // Comparing password hash codes
        bcrypt.compare(
          request.body.password,
          data.Item.password,
          (fail, success) => {
            if (success) {
              // hash password matched
              console.log(
                `User credentials matched. Logging ${data.Item.username} in...`
              );
              // update previous sessionid
              const userSessionid = uuidv4();
              DynamoDB.update({
                TableName: "sessions",
                Key: { username: data.Item.username },
                UpdateExpression: "set recentSession = :sessionid",
                ExpressionAttributeValues: {
                  ":sessionid": userSessionid,
                },
              })
                .promise()
                .then((sessionUpdateData) => {
                  //session updated
                  console.log(
                    "SessionID for " +
                      data.Item.username +
                      " added to sessions table"
                  );
                  response.cookie("sessionid", `${userSessionid}`, {
                    httpOnly: true,
                    sameSite: "strict",
                    path: "/",
                    secure: true,
                  });
                  response.cookie("username", `${data.Item.username}`, {
                    httpOnly: true,
                    sameSite: "strict",
                    path: "/",
                    secure: true,
                  });
                  // response.cookie('sessionid', `${userSessionid}`);
                  // response.cookie('username', `${data.Item.username}`);
                  response.setHeader(
                    "connect-src",
                    "wss://yourchats.herokuapp.com/"
                  );
                  response.redirect("/chats");
                })
                .catch((sessionUpdateError) => {
                  //error while updating sesion
                  console.log(
                    "Error while updating/adding SessionID for " +
                      data.Item.username +
                      " to sessions table"
                  );
                  response.send("Error. Try again later");
                  response.end();
                });
            } else {
              // hash password didn't match
              response.sendStatus(401);
              response.end();
            }
          }
        );
      } else {
        // this username does not exist
        response.redirect("/");
        response.end();
      }
    })
    .catch((error) => response.send(error));
});

module.exports = router;
