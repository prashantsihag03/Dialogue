// dependencies
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const { sessionAuthentication } = require("../utility/Auth");
const { capitaliseFirstLetter } = require("../utility/stringUtils");
const router = express.Router();

router.get("/chats", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    DynamoDB.get({
      TableName: "users",
      Key: { username: response.locals.sessionUsername },
      ProjectionExpression: "username, notification, friends",
    })
      .promise()
      .then((userdata) => {
        if (userdata != undefined) {
          response.render("chats", {
            username: capitaliseFirstLetter(response.locals.sessionUsername),
            notificationPreference: userdata.Item.notification,
            friends: userdata.Item.friends,
          });
        } else {
          response.sendStatus(404);
          response.end();
        }
      })
      .catch((error) => console.error(error));
  } else {
    response.clearCookie("sessionid");
    response.clearCookie("username");
    response.redirect("/");
  }
});

//Get chat history
router.get(
  "/chats/previousChats/:withUsername",
  sessionAuthentication,
  (request, response) => {
    if (response.locals.sessionAuthenticated) {
      //get session user record to get chatid
      DynamoDB.get({
        TableName: "users",
        Key: { username: response.locals.sessionUsername },
        ConsistentRead: true,
        ProjectionExpression: "friends",
      })
        .promise()
        .then((sessionUserData) => {
          if (sessionUserData.Item != null) {
            let inFriendList = false;
            if (sessionUserData.Item.friends.length >= 1) {
              sessionUserData.Item.friends.every((userfriend) => {
                if (userfriend.friendName == request.params.withUsername) {
                  inFriendList = true;
                  // fetch chats with this friends chatid
                  DynamoDB.scan({
                    TableName: "chats",
                    FilterExpression: "contains(chatid, :chatid)",
                    ExpressionAttributeValues: {
                      ":chatid": userfriend.chatid,
                    },
                    ProjectionExpression:
                      "sender, chatSrNo, message, dateAndTime, receipt",
                  })
                    .promise()
                    .then((chatsData) => {
                      // console.log(chatsData.Items);
                      if (chatsData.Items != null) {
                        response.send(JSON.stringify(chatsData.Items));
                      } else {
                        response.sendStatus(404);
                        response.end();
                      }
                    })
                    .catch((error) => console.log(error));
                }
              });
            }
            // if user was not in friend list
            if (!inFriendList) {
              let errorMsg = {
                type: "Error",
                description: "User not friends",
              };
              response.send(JSON.stringify(errorMsg));
            }
          }
        })
        .catch((sessionUserError) => {
          //error getting user data from table
          console.log(sessionUserError);
        });
    } else {
      //session invalid
      response.clearCookie("sessionid");
      response.clearCookie("username");
      response.redirect("/");
    }
  }
);

// Get friends list
router.get("/chats/myfriends", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    // getting friends list of this user
    DynamoDB.get({
      TableName: "users",
      Key: { username: response.locals.sessionUsername },
      ConsistentRead: true,
    })
      .promise()
      .then((userData) => {
        if (userData.Item != null) {
          let allFriends = [];
          userData.Item.friends.forEach((friend) => {
            allFriends.push(friend.friendName);
          });
          response.send(JSON.stringify(allFriends));
        } else {
          //user data not found
          //user do not exist
          response.clearCookie("sessionid");
          response.clearCookie("username");
          response.redirect("/");
        }
      })
      .catch((error) => {
        console.log("Error");
      });
  } else {
    response.clearCookie("sessionid");
    esponse.clearCookie("username");
    response.redirect("/");
  }
});

// get session user data
router.get("/chats/myprofile", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    // get user data
    DynamoDB.get({
      TableName: "users",
      Key: { username: response.locals.sessionUsername },
      ProjectionExpression: "username, friends",
    })
      .promise()
      .then((data) => {
        // sending user data
        let userData = {
          username: response.locals.sessionUsername,
          friends: data.friends,
        };
        response.send(JSON.stringify(userData));
      })
      .catch((error) => console.log(error));
  } else {
    response.clearCookie("sessionid");
    response.clearCookie("username");
    response.redirect("/");
  }
});

//get search user profile
router.get(
  "/chats/getUserProfile/:username",
  sessionAuthentication,
  (request, response) => {
    let getThisUser = request.params.username.toLowerCase();
    getThisUser = getThisUser.trim();
    console.log(getThisUser);
    let chatRequestResult = {
      sent: false,
      sentWhen: "",
      received: false,
      receivedWhen: "",
    };

    let ExecFailure = { allFailures: [] };

    // has sessionUser received request from search User ?
    DynamoDB.get({
      TableName: "friendRequests",
      Key: {
        senderUsername: getThisUser,
        receiverUsername: response.locals.sessionUsername,
      },
    })
      .promise()
      .then((data) => {
        console.log("Request data for search user is: " + data);
        if (data.Item != undefined && data.Item != null) {
          // session user has received request to search user already
          chatRequestResult.received = true;
          chatRequestResult.receivedWhen = data.Item.when;
          response.status(200).send(JSON.stringify(chatRequestResult));
        } else {
          // session user has NOT received request to search user already
          // session user might have sent request from search user
          DynamoDB.get({
            TableName: "friendRequests",
            Key: {
              senderUsername: response.locals.sessionUsername,
              receiverUsername: getThisUser,
            },
          })
            .promise()
            .then((secondData) => {
              if (secondData.Item != undefined && secondData.Item != null) {
                // session user have sent request to search user
                chatRequestResult.sent = true;
                chatRequestResult.sentWhen = secondData.Item.when;
                response.status(200).send(JSON.stringify(chatRequestResult));
              }
            })
            .catch((error) => {
              ExecFailure.occurred = true;
              ExecFailure.allFailures.push(error);
              console.log("it is here");
              console.log(error);
              response.sendStatus(500);
            });
        }
      })
      .catch((error) => {
        ExecFailure.occurred = true;
        ExecFailure.allFailures.push(error);
        console.log("no, it is here");
        response.sendStatus(404);
      });
  }
);

// Search users
router.get(
  "/chats/searchuser/:usernametosearch",
  sessionAuthentication,
  (request, response) => {
    request.params.usernametosearch =
      request.params.usernametosearch.toLowerCase();
    if (response.locals.sessionAuthenticated) {
      //session user authenticated
      if (response.locals.sessionUsername == request.params.usernametosearch) {
        //user searched for themselves
        response.sendStatus(204);
        response.end();
      } else {
        DynamoDB.scan({
          TableName: "users",
          FilterExpression: "contains(username, :searchUsername)",
          ExpressionAttributeValues: {
            ":searchUsername": request.params.usernametosearch,
          },
          ProjectionExpression: "username",
        })
          .promise()
          .then((result) => {
            if (result.Items != null) {
              let sessionUserInList = result.Items.find(
                (user) => user.username == response.locals.sessionUsername
              );
              if (sessionUserInList != undefined) {
                result.Items.splice(result.Items.indexOf(sessionUserInList), 1);
                response.send(JSON.stringify(result.Items));
              } else {
                response.send(JSON.stringify(result.Items));
              }
            } else {
              response.sendStatus(404);
              response.end();
            }
          })
          .catch((error) => console.log(error));
      }
    } else {
      //session user is not valid
      response.clearCookie("sessionid");
      response.clearCookie("username");
      response.redirect("/");
    }
  }
);

router.post(
  "/chats/sendfriendrequest",
  sessionAuthentication,
  (request, response) => {
    if (response.locals.sessionAuthenticated) {
      //this will add new friendRequest if not already exist,
      //replace it with new info if already exists
      DynamoDB.put({
        TableName: "friendRequests",
        Item: {
          senderUsername: response.locals.sessionUsername,
          receiverUsername: request.body.to.toLowerCase(),
          when: new Date().toUTCString(),
        },
      })
        .promise()
        .then((done) => {
          response.sendStatus(200);
          response.end();
        })
        .catch((error) => console.log(error));
    } else {
      //session invalid
      response.clearCookie("sessionid");
      response.clearCookie("username");
      response.redirect("/");
    }
  }
);

router.post(
  "/chats/acceptfriendrequest",
  sessionAuthentication,
  (request, response) => {
    let requestSender = request.body.of.toLowerCase();
    let requestReceiver = response.locals.sessionUsername;

    if (response.locals.sessionAuthenticated) {
      //session authenticated
      //verify if this friendRequest exist: if yes accept it
      DynamoDB.get({
        TableName: "friendRequests",
        Key: {
          senderUsername: requestSender,
          receiverUsername: requestReceiver,
        },
        ProjectionExpression: "senderUsername, receiverUsername",
      })
        .promise()
        .then((friendRequest) => {
          if (friendRequest.Item != null) {
            //friend request exists, accept this request: add into both user's friend list
            let randomID = uuidv4();
            randomID = randomID.replace("-", "");
            chatid = requestSender + "-" + requestReceiver + "-" + randomID;
            //updating requestReceiver's friend list
            DynamoDB.update({
              TableName: "users",
              Key: { username: requestReceiver },
              UpdateExpression:
                "set friends = list_append(friends, :newfriend)",
              ExpressionAttributeValues: {
                ":newfriend": [{ friendName: requestSender, chatid: chatid }],
              },
            })
              .promise()
              .then((requestSenderDataUpdated) => {
                //updating requestSender's friend list
                DynamoDB.update({
                  TableName: "users",
                  Key: { username: requestSender },
                  UpdateExpression:
                    "set friends = list_append(friends, :newfriend)",
                  ExpressionAttributeValues: {
                    ":newfriend": [
                      { friendName: requestReceiver, chatid: chatid },
                    ],
                  },
                })
                  .promise()
                  .then((requestReceiverDataUpdated) => {
                    //delete this friend request from friendRequest table
                    DynamoDB.delete({
                      TableName: "friendRequests",
                      Key: {
                        senderUsername: requestSender,
                        receiverUsername: requestReceiver,
                      },
                    })
                      .promise()
                      .then((friendRequestDeleted) => {
                        response.sendStatus(200);
                        response.end();
                      })
                      .catch((error) => console.log(error));
                  })
                  .catch((error) => console.log(error));
              })
              .catch((error) => console.log(error));
          } else {
            //query returned null i.e. friendRequest do not exists
            response.sendStatus(404);
            response.end();
          }
        })
        .catch((error) => console.log(error));
    } else {
      //session invalid
      response.clearCookie("sessionid");
      response.redirect("/");
    }
  }
);

router.post(
  "/chats/rejectfriendrequest",
  sessionAuthentication,
  (request, response) => {
    if (response.locals.sessionAuthenticated) {
      //delete this friendRequest
      DynamoDB.delete({
        TableName: "friendRequests",
        Key: {
          senderUsername: request.body.of.toLowerCase(),
          receiverUsername: response.locals.sessionUsername,
        },
      })
        .promise()
        .then((data) => {
          response.sendStatus(200);
          response.end();
        })
        .catch((error) => {
          response.sendStatus(404);
          response.end();
        });
    } else {
      response.clearCookie("sessionid");
      response.clearCookie("username");
      response.redirect("/");
    }
  }
);

router.get(
  "/chats/chatRequests",
  sessionAuthentication,
  (request, response) => {
    if (response.locals.sessionAuthenticated) {
      // session validated
      // check if there is any friend requests
      let chatRequests = [];
      DynamoDB.scan({
        TableName: "friendRequests",
        FilterExpression: "contains(receiverUsername, :username)",
        ExpressionAttributeValues: {
          ":username": response.locals.sessionUsername,
        },
      })
        .promise()
        .then((result) => {
          if (result.Items != null) {
            //returned non empty list
            result.Items.forEach((friendRequest) => {
              chatRequests.push({
                type: "request",
                from: friendRequest.senderUsername,
                dateTime: friendRequest.when,
              });
            });
            response.send(JSON.stringify(chatRequests));
          } else {
            response.sendStatus(200);
            response.end();
          }
        })
        .catch((error) => {
          response.sendStatus(404);
          response.end();
        });
    } else {
      // session invalid
      response.clearCookie("sessionid");
      response.clearCookie("username");
      response.redirect("/");
    }
  }
);

// logout user
router.get("/chats/logout", sessionAuthentication, (request, response) => {
  if (response.locals.sessionAuthenticated) {
    // session authenticated
    SOCKET.clients.forEach((client) => {
      if (client.username == response.locals.sessionUsername) {
        client.terminate();
        console.log(
          response.locals.sessionUsername +
            "'s socket connection has been disconnected."
        );
        DynamoDB.delete({
          TableName: "sessions",
          Key: { username: response.locals.sessionUsername },
        })
          .promise()
          .then((sessionRemoved) =>
            console.log(
              response.locals.sessionUsername +
                "'s sessions removed successfully"
            )
          )
          .catch((error) => console.log(error));
      }
    });
  } else {
    // this user do not have valid session id
    console.log("User with no cookies tried to logout.");
  }
  response.clearCookie("sessionid");
  response.clearCookie("username");
  response.redirect("/");
});

module.exports = router;
