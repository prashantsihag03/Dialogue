// dependencies
require("dotenv").config();
const WEBPUSH = require("web-push");
const EXPRESS = require("express");
const HTTP = require("http");
const WS = require("ws");
const PORT = process.env.PORT || 3000;
const URL = require("url");
const path = require("path");
const COOKIEPARSER = require("cookie-parser");
const AWS = require("aws-sdk");
const { getTwoDigitValue } = require("./utility/stringUtils");
AWS.config.update({
  region: "us-east-2",
});

//AWS database
const DynamoDB = new AWS.DynamoDB.DocumentClient();

// set Vapid Details for push notifications
WEBPUSH.setVapidDetails(
  "mailto:test@test.com",
  process.env.PublicVapidKey,
  process.env.PrivateVapidKey
);

// create express instance
const APP = EXPRESS();

//setting template engine
APP.set("view engine", "ejs");

// removes the x-powered by header if it was set
APP.disable("x-powered-by");

//securing http request
// APP.use(HELMET({
//     contentSecurityPolicy: false,
// }));

// cookies
APP.use(COOKIEPARSER());

// parsing json
APP.use(EXPRESS.json());

// middleware for static files
APP.use(EXPRESS.static(path.join(__dirname, "public")));

// middleware for parsing body of POST requests
APP.use(EXPRESS.urlencoded({ extended: false }));

// creating server
const SERVER = HTTP.createServer(APP);

//listening for requests
SERVER.listen(PORT, (error) => {
  if (error) {
    console.log("Erro encountered while listening to requests");
  } else {
    console.log("Server is listening at PORT: " + PORT);
  }
});

// base routes
APP.use("/", require("./routes/base"));
APP.use("/", require("./routes/authentication"));
APP.use("/", require("./routes/chats"));

// websocket initiation
const SOCKET = new WS.Server({
  noServer: true,
  perMessageDeflate: false,
  clientTracking: true,
});

// upgrade protocol to websocket
SERVER.on("upgrade", (request, socket, head) => {
  const PATH = URL.parse(request.url).pathname;
  let sessionid = null;
  let username = null;
  // check if socket request path is correct
  if (PATH == "/chats") {
    // check if cookies are available
    if (request.headers.cookie != null && request.headers.cookie != undefined) {
      let cookiesList = request.headers.cookie.split(";");
      // request.headers.cookie might have only one cookie.
      cookiesList.forEach((cookie) => {
        let thisCookie = cookie.split("=");
        if (thisCookie != null) {
          thisCookie[0] = thisCookie[0].trim();
          thisCookie[1] = thisCookie[1].trim();
          if (thisCookie[0].toLowerCase() == "sessionid") {
            sessionid = thisCookie[1];
          } else if (thisCookie[0].toLowerCase() == "username") {
            username = thisCookie[1];
          }
        }
      });
    }
    if (sessionid != null && username != null) {
      // verify session from session database
      console.log("CONN UPGRADE request received from session: " + sessionid);
      DynamoDB.get({
        TableName: "sessions",
        Key: { username: username },
        ConsistentRead: true,
        ProjectionExpression: "username, recentSession",
      })
        .promise()
        .then((sessionData) => {
          //session returned
          if (
            sessionData.Item != null &&
            sessionData.Item.username == username
          ) {
            console.log(
              sessionid +
                " is verified and is valid. Procedding to upgrade the conn"
            );
            SOCKET.handleUpgrade(request, socket, head, (socket) => {
              // terminate this user's previous socket connection
              SOCKET.clients.forEach((client) => {
                if (client.username === sessionData.Item.username) {
                  // previous socket found
                  client.terminate();
                }
              });

              // add username and sessionid to this username's socket connection variable
              socket.username = sessionData.Item.username;
              socket.sessionid = sessionData.Item.recentSession;

              // check for user's previous socket instance
              // if there, remove it and store new one
              console.log("New Socket Conn for " + socket.username + " added");
              SOCKET.emit("connection", socket, request);
            });
          } else {
            //query returned unexpected results
            console.log(
              "Session with id: " +
                sessionid +
                " is invalid. rejecting con upgrade request"
            );
            socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          }
        })
        .catch((sessionError) => {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        });
    } else {
      console.log("Unauthorizing socket connection");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    }
  } else {
    //socket request path is incorrect
    console.log("Socket conn path incorrect");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
  }
});

function heartbeat() {
  console.log("Pong received");
  this.is_Alive = true;
}

// websocket connection
SOCKET.on("connection", (socket, request, head) => {
  console.log("Socket Connection with a new user");
  let username = socket.username;
  socket.is_Alive = true;

  // on receiving message
  socket.on("message", (message) => {
    message = JSON.parse(message);
    if (message.purpose == "chat-message") {
      // for actual communication messages
      // check if reciever exist or not
      let receiver = message.to;
      let sender = username;
      DynamoDB.get({
        TableName: "users",
        Key: { username: receiver },
        ConsistentRead: true,
        ProjectionExpression: "username, friends",
      })
        .promise()
        .then((receiverData) => {
          if (receiverData.Item != null) {
            // receiver found - check if receiver has sender in his/her friends list
            receiverData.Item.friends.forEach((friend) => {
              if (friend.friendName == sender) {
                // they are friend
                let chatId = friend.chatid;
                // structuring message to store in database
                let dateRightNow = new Date();
                //creating a serial number for particular chat message
                let srYear = dateRightNow.getUTCFullYear();
                let srMonth = getTwoDigitValue(dateRightNow.getUTCMonth());
                let srDate = getTwoDigitValue(dateRightNow.getUTCDate());
                let srHours = getTwoDigitValue(dateRightNow.getUTCHours());
                let srMinutes = getTwoDigitValue(dateRightNow.getUTCMinutes());
                let srSeconds = getTwoDigitValue(dateRightNow.getUTCSeconds());
                //date time of chat message to store in DB
                let chatDateTime = dateRightNow.toUTCString();
                let chat = {
                  chatid: chatId,
                  chatSrNo: parseInt(
                    srYear + srMonth + srDate + srHours + srMinutes + srSeconds
                  ),
                  sender: sender,
                  dateAndTime: chatDateTime,
                  message: message.chat,
                  receipt: "sent",
                };
                message.time = chatDateTime;
                // check if this user is online
                SOCKET.clients.forEach((client) => {
                  if (client.username == receiver) {
                    // user is online
                    message.from = username;
                    client.send(JSON.stringify(message));
                    chat.receipt = "delivered";
                  }
                });
                //send notification to receiver
                sendNotification(receiver, {
                  title: `Msg from ${username}`,
                  body: message.chat,
                });
                // insert message to database
                DynamoDB.put({
                  TableName: "chats",
                  Item: chat,
                })
                  .promise()
                  .then((data) => {
                    console.log("Message added to database");
                  })
                  .catch((error) => console.log(error));
              }
            });
          } else {
            //receiver do not exists
            socket.send(
              JSON.stringify({
                from: "Error",
                purpose: "Error",
                error: "User does not exist",
              })
            );
          }
        })
        .catch((error) => console.log(error));
    }
  });

  //on pong
  socket.on("pong", heartbeat);

  // on close event
  SOCKET.on("close", () => {
    SOCKET.clients.forEach((client) => {
      if (client.username == username) {
        console.log("Request to close a socket connection");
        client.terminate();
        console.log("Socket connection for a user closed");
      } else {
        console.log("User tried to close a non-existing socket connection");
      }
    });
  });
});

//send ping on interval of 30sec
const interval = setInterval(() => {
  console.log("Total socket connections now: " + SOCKET.clients.size);
  if (SOCKET.clients.size >= 1) {
    console.log("pinging clients");
    SOCKET.clients.forEach((client) => {
      if (client.is_Alive === false) {
        return client.terminate();
      }
      client.is_Alive = false;
      client.ping(noop);
    });
  }
}, 30000);

//empty function serving as empty payload
// for socket pings
function noop() {}
