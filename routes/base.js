require("dotenv").config();
const express = require("express");
const path = require("path");
const WEBPUSH = require("web-push");
const path = require("path");
const { sessionAuthentication } = require("./utility/Auth");

const router = express.Router();
const publicAbsPath = path.resolve("./public");

router.get("/", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    // valid session exists at client
    response.redirect("/chats");
  } else {
    response.sendFile(`${publicAbsPath}/register.html`);
  }
});

//username available
router.post("/usernameAvailability", (request, response) => {
  let check_this_username = request.body.username;
  DynamoDB.get({
    TableName: "users",
    Key: { username: check_this_username },
    ConsistentRead: true,
    ProjectionExpression: "username",
  })
    .promise()
    .then((queryResult) => {
      if (queryResult.Item != undefined && queryResult.Item != null) {
        // username found
        if (queryResult.Item.username == check_this_username) {
          response.sendStatus(302);
          response.end();
        } else {
          response.sendStatus(404);
          response.end();
        }
      } else {
        // username not found
        response.sendStatus(404);
        response.end();
      }
    })
    .catch((error) => console.error(error));
});

// subscribe route
router.post("/subscribe", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    //get push subscription object
    const subscription = request.body;
    // storing subscription info into database
    DynamoDB.update({
      TableName: "users",
      Key: { username: response.locals.sessionUsername },
      UpdateExpression: "set notification = :subscription",
      ExpressionAttributeValues: {
        ":subscription": [subscription],
      },
    })
      .promise()
      .then((result) => {
        // send 201 - resource created
        response.status(201).json({});
        // create payload
        const payload = JSON.stringify({ title: "Notification are now ON." });
        // pass object into sendNotification
        WEBPUSH.sendNotification(subscription, payload).catch((error) =>
          console.error(error)
        );
      })
      .catch((error) => console.error(error));
  } else {
    response.clearCookie("username");
    response.clearCookie("sessionid");
    response.sendStatus(400);
  }
});

router.get(
  "/optOutPushNotification",
  sessionAuthentication,
  (request, response) => {
    if (response.locals.sessionAuthenticated) {
      DynamoDB.update({
        TableName: "users",
        Key: { username: response.locals.sessionUsername },
        UpdateExpression: "remove notification",
      })
        .promise()
        .then((result) => {
          console.log("Result: " + result);
          // send 201 - resource created
          response.sendStatus(200);
          response.end();
        })
        .catch((error) => console.error(error));
    } else {
      response.clearCookie("username");
      response.clearCookie("sessionid");
      response.sendStatus(400);
    }
  }
);

module.exports = router;
