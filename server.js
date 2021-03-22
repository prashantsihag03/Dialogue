// dependencies
require('dotenv').config();
const WEBPUSH = require('web-push');
const EXPRESS = require('express');
const HTTP = require('http');
const WS = require('ws');
const PORT = process.env.PORT || 3000;
const URL = require('url');
const path = require('path');
const bodyParser = require('body-parser');
const COOKIEPARSER = require('cookie-parser');
const {v4: uuidv4} = require('uuid');
const HELMET = require('helmet');
const bcrypt = require('bcrypt');
const SALT = 10;
const AWS = require('aws-sdk');
const helmet = require('helmet');
AWS.config.update({
    region: 'us-east-2'
});

//AWS database
const DynamoDB = new AWS.DynamoDB.DocumentClient();

// set Vapid Details for push notifications
WEBPUSH.setVapidDetails('mailto:test@test.com', process.env.PublicVapidKey, process.env.PrivateVapidKey);

// create express instance
const APP = EXPRESS();

//setting template engine
APP.set('view engine', 'ejs');

// removes the x-powered by header if it was set
APP.disable("x-powered-by");

//securing http request 
APP.use(HELMET({
    contentSecurityPolicy: false,
}));

// cookies
APP.use(COOKIEPARSER());

// body parser
APP.use(bodyParser.json());

// parsing json
APP.use(EXPRESS.json());

// middleware for static files
APP.use(EXPRESS.static(path.join(__dirname, 'public')));

// middleware for parsing body of POST requests
APP.use(EXPRESS.urlencoded({extended: false}));

// creating server
const SERVER = HTTP.createServer(APP);

//listening for requests
SERVER.listen(PORT, (error) => {
    if (error) {
        console.log('Erro encountered while listening to requests');
    } else {
        console.log('Server is listening at PORT: ' + PORT);
    };
});

APP.get('/', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        // valid session exists at client
        console.log("IP address for client connected is: "+ request.ip);
        response.redirect('/chats');
    } else {
        response.sendFile('register.html', { root: path.join(__dirname, '/public') });
    };
});

// serving POST request for user signup
APP.post('/signup', (request, response) => {
    request.body.email = request.body.email.trim();
    request.body.password = request.body.password.trim();
    request.body.username = request.body.username.trim();
    request.body.username = request.body.username.toLowerCase();
    // check if the username already exist in db or not ?
    DynamoDB.get({ 
        TableName: 'users', Key: {'username': request.body.username}, 
        ConsistentRead: true, ProjectionExpression: 'username'
    }).promise()
    .then(data => {
        if (data.Item != null) { 
            response.send(`Username ${data.Item.username} already exists in USERS table at DynamoDB`);
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
                emails: [{address: request.body.email, primary: true}],
                mobile: []
            };
            //storing user 
            DynamoDB.put({Item: user, TableName: 'users'}).promise()
            .then(data => {
                console.log("New user signed up successfully");
                response.redirect('/');
            })
            .catch(error => {
                response.send("Error occurred while writing data to users table");
                response.end();
            });
        };
    })
    .catch(error => {
        console.log("Error occurred. Please try again later");
    });  
});

APP.post('/login', (request, response) => {
    request.body.username = request.body.username.toLowerCase();
    // check if the user exists or not
    DynamoDB.get({ 
        TableName: 'users', Key: {'username': request.body.username}, 
        ConsistentRead: true, ProjectionExpression: 'username, password'
    }).promise()
    .then(data => {
        if (data.Item != null) {//this username exists
            // Comparing password hash codes
            bcrypt.compare(request.body.password, data.Item.password, (fail, success) => {
                if (success) { // hash password matched
                    console.log(`User credentials matched. Logging ${data.Item.username} in...`);
                    // update previous sessionid
                    const userSessionid = uuidv4();
                    DynamoDB.update({
                        TableName: 'sessions', 
                        Key: {username: data.Item.username},
                        UpdateExpression: 'set recentSession = :sessionid',
                        ExpressionAttributeValues: {
                            ':sessionid': userSessionid
                        }
                    }).promise()
                    .then(sessionUpdateData => {
                        //session updated
                        console.log('SessionID for '+data.Item.username+' added to sessions table');
                        response.cookie('sessionid', `${userSessionid}`, {httpOnly: true, sameSite: "strict", path: '/', secure: true});
                        response.cookie('username', `${data.Item.username}`, {httpOnly: true, sameSite: "strict", path: '/', secure: true});
                        // response.cookie('sessionid', `${userSessionid}`);
                        // response.cookie('username', `${data.Item.username}`);
                        response.setHeader('connect-src', 'wss://yourchats.herokuapp.com/')
                        response.redirect('/chats');
                    })
                    .catch(sessionUpdateError => {
                        //error while updating sesion
                        console.log('Error while updating/adding SessionID for '+data.Item.username+' to sessions table');
                        response.send('Error. Try again later');
                        response.end();
                    });
                } else { // hash password didn't match
                    response.sendStatus(401);
                    response.end();
                };
            });
        } else {
            // this username does not exist
            response.redirect('/');
            response.end();
        };
    })
    .catch(error => response.send("Error Occurred. Please try again later."));
});

APP.get('/chats', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        DynamoDB.get({
            TableName: 'users', 
            Key: {username: response.locals.sessionUsername},
            ProjectionExpression: 'username, notification, friends'
        }).promise()
        .then(userdata => {
            if (userdata != undefined) {
                response.render('chats', {
                    username: capitaliseFirstLetter(response.locals.sessionUsername),
                    notificationPreference: userdata.Item.notification,
                    friends: userdata.Item.friends
                });
            } else {
                response.sendStatus(404);
                response.end();
            }
        }).catch(error => console.error(error));
    } else {
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    }; 
});

//Get chat history
APP.get('/chats/previousChats/:withUsername', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        //get session user record to get chatid
        DynamoDB.get({
            TableName: 'users', Key: {username: response.locals.sessionUsername}, 
            ConsistentRead: true, ProjectionExpression: 'friends'
        }).promise()
        .then(sessionUserData => {
            if (sessionUserData.Item != null) {
                let inFriendList = false;
                if (sessionUserData.Item.friends.length >= 1) {
                    sessionUserData.Item.friends.every(userfriend => {
                        if (userfriend.friendName == request.params.withUsername) {
                            inFriendList = true;
                            // fetch chats with this friends chatid
                            DynamoDB.scan({
                                TableName: 'chats',
                                FilterExpression: 'contains(chatid, :chatid)',
                                ExpressionAttributeValues: {
                                    ':chatid': userfriend.chatid
                                }, 
                                ProjectionExpression: 'sender, chatSrNo, message, dateAndTime, receipt'
                            }).promise()
                            .then(chatsData => {
                                // console.log(chatsData.Items);
                                if (chatsData.Items != null) {
                                    response.send(JSON.stringify(chatsData.Items));
                                } else {
                                    response.sendStatus(404);
                                    response.end();
                                }
                            }).catch(error => console.log(error));
                        };
                    });
                };
                // if user was not in friend list
                if (!inFriendList) {
                    let errorMsg = {
                        type: "Error",
                        description: "User not friends",
                    };
                    response.send(JSON.stringify(errorMsg));
                };
            };
        }).catch(sessionUserError => {
            //error getting user data from table
            console.log(sessionUserError);
        });
    } else {
        //session invalid
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

// Get friends list
APP.get('/chats/myfriends', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        // getting friends list of this user
        DynamoDB.get({
            TableName: 'users', Key: {username: response.locals.sessionUsername},
            ConsistentRead: true
        }). promise()
        .then(userData => {
            if (userData.Item != null) {
                let allFriends = [];
                userData.Item.friends.forEach(friend => {
                    allFriends.push(friend.friendName);
                });
                response.send(JSON.stringify(allFriends));
            } else {
                //user data not found
                //user do not exist
                response.clearCookie('sessionid');
                response.clearCookie('username');
                response.redirect('/');
            };
        })
        .catch(error => {
            console.log('Error');
        });
    } else {
        response.clearCookie('sessionid');
        esponse.clearCookie('username');
        response.redirect('/');
    };
});

// get session user data
APP.get('/chats/myprofile', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        // get user data 
        DynamoDB.get({TableName: 'users', 
            Key: { username: response.locals.sessionUsername },
            ProjectionExpression: 'username, friends'
        }).promise()
        .then(data => {
            // sending user data
            let userData = {
                username: response.locals.sessionUsername,
                friends: data.friends
            };
            response.send(JSON.stringify(userData));
        }).catch(error => console.log(error));
    } else {
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

//get search user profile
APP.get('/chats/getUserProfile/:username', sessionAuthentication, (request, response) => {
    let getThisUser = request.params.username.toLowerCase();
    getThisUser = getThisUser.trim();
    console.log(getThisUser);
    let chatRequestResult = {
        sent: false, sentWhen: '' ,
        received: false, receivedWhen: ''
    };

    let ExecFailure = { allFailures: []};

    // has sessionUser received request from search User ?
    DynamoDB.get({
        TableName: 'friendRequests', 
        Key: {
            senderUsername: getThisUser, 
            receiverUsername: response.locals.sessionUsername
        }
    }).promise()
    .then(data => {
        console.log("Request data for search user is: "+data);
        if ((data.Item != undefined) && (data.Item != null)) {
            // session user has received request to search user already
            chatRequestResult.received = true;
            chatRequestResult.receivedWhen = data.Item.when;
            response.status(200).send(JSON.stringify(chatRequestResult));
        } else {
            // session user has NOT received request to search user already
            // session user might have sent request from search user
            DynamoDB.get({
                TableName: 'friendRequests', 
                Key: {
                    senderUsername: response.locals.sessionUsername, 
                    receiverUsername: getThisUser
                }
            }).promise()
            .then(secondData => {
                if ((secondData.Item != undefined) && (secondData.Item != null)) {
                    // session user have sent request to search user
                    chatRequestResult.sent = true;
                    chatRequestResult.sentWhen = secondData.Item.when;
                    response.status(200).send(JSON.stringify(chatRequestResult));
                };
            }).catch(error => {
                ExecFailure.occurred = true;
                ExecFailure.allFailures.push(error);
                console.log("it is here");
                console.log(error);
                response.sendStatus(500);
            });
        };
    }).catch(error => {
        ExecFailure.occurred = true;
        ExecFailure.allFailures.push(error);
        console.log("no, it is here");
        response.sendStatus(404);
    });
});

// Search users
APP.get('/chats/searchuser/:usernametosearch', sessionAuthentication, (request, response) => {
    request.params.usernametosearch = request.params.usernametosearch.toLowerCase();
    if (response.locals.sessionAuthenticated) { 
        //session user authenticated
        if (response.locals.sessionUsername == request.params.usernametosearch) { 
            //user searched for themselves
            response.sendStatus(204);
            response.end();
        } else {
            DynamoDB.scan({
                TableName: 'users', 
                FilterExpression: 'contains(username, :searchUsername)',
                ExpressionAttributeValues: {':searchUsername': request.params.usernametosearch},
                ProjectionExpression: 'username'
            }).promise()
            .then(result => {
                if (result.Items != null) {
                    let sessionUserInList = result.Items.find(user => user.username == response.locals.sessionUsername);
                    if (sessionUserInList != undefined) {
                        result.Items.splice(result.Items.indexOf(sessionUserInList), 1)
                        response.send(JSON.stringify(result.Items));
                    } else {
                        response.send(JSON.stringify(result.Items));
                    };
                } else {
                    response.sendStatus(404);
                    response.end();
                }
            }).catch(error => console.log(error));
        };
    } else { //session user is not valid
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

//username available
APP.post('/usernameAvailability', (request, response) => {
    let check_this_username = request.body.username;
    DynamoDB.get({ 
        TableName: 'users', Key: {username: check_this_username},
        ConsistentRead: true, ProjectionExpression: 'username'
    }).promise().then(queryResult => {
        if ((queryResult.Item != undefined) && (queryResult.Item != null)) {
            // username found
            if (queryResult.Item.username == check_this_username) {
                response.sendStatus(302);
                response.end();
            } else {
                response.sendStatus(404);
                response.end();
            };
        } else {
            // username not found
            response.sendStatus(404);
            response.end();
        };
    }).catch(error => console.error(error));
});

// logout user
APP.get('/chats/logout', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        // session authenticated
        SOCKET.clients.forEach(client => {
            if (client.username == response.locals.sessionUsername) {
                client.terminate();
                console.log(response.locals.sessionUsername+"'s socket connection has been disconnected.");
                DynamoDB.delete({
                    TableName: 'sessions', Key: {username: response.locals.sessionUsername}
                }).promise()
                .then(sessionRemoved => console.log(response.locals.sessionUsername+"'s sessions removed successfully"))
                .catch(error => console.log(error));
            }; 
        });
    } else { // this user do not have valid session id
        console.log("User with no cookies tried to logout.");
    };
    response.clearCookie('sessionid');
    response.clearCookie('username');
    response.redirect('/');
});

APP.post('/chats/sendfriendrequest', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        //this will add new friendRequest if not already exist, 
        //replace it with new info if already exists
        DynamoDB.put({
            TableName: 'friendRequests',
            Item: {
                senderUsername: response.locals.sessionUsername,
                receiverUsername: request.body.to.toLowerCase(),
                when: new Date().toUTCString()
            }
        }).promise()
        .then(done => {
            response.sendStatus(200);
            response.end();
        }).catch(error => console.log(error));
    } else {
        //session invalid
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

APP.post('/chats/acceptfriendrequest', sessionAuthentication, (request, response) => {
    let requestSender = request.body.of.toLowerCase();
    let requestReceiver = response.locals.sessionUsername;

    if (response.locals.sessionAuthenticated) { //session authenticated
        //verify if this friendRequest exist: if yes accept it
        DynamoDB.get({
            TableName: 'friendRequests',
            Key: {senderUsername: requestSender, receiverUsername: requestReceiver},
            ProjectionExpression: 'senderUsername, receiverUsername'
        }).promise()
        .then(friendRequest => {
            if (friendRequest.Item != null) { 
                //friend request exists, accept this request: add into both user's friend list
                let randomID = uuidv4();
                randomID = randomID.replace('-', '');
                chatid = requestSender+'-'+requestReceiver+'-'+randomID;
                //updating requestReceiver's friend list
                DynamoDB.update({
                    TableName: 'users', 
                    Key: {username: requestReceiver},
                    UpdateExpression: 'set friends = list_append(friends, :newfriend)',
                    ExpressionAttributeValues: {
                        ':newfriend': [{friendName: requestSender, chatid: chatid}]
                    }
                }).promise()
                .then(requestSenderDataUpdated => {
                    //updating requestSender's friend list
                    DynamoDB.update({
                        TableName: 'users', 
                        Key: {username: requestSender},
                        UpdateExpression: 'set friends = list_append(friends, :newfriend)',
                        ExpressionAttributeValues: {
                            ':newfriend': [{friendName: requestReceiver, chatid: chatid}]
                        }
                    }).promise()
                    .then(requestReceiverDataUpdated => {
                        //delete this friend request from friendRequest table
                        DynamoDB.delete({
                            TableName: 'friendRequests', Key: {senderUsername: requestSender, receiverUsername: requestReceiver}
                        }).promise()
                        .then(friendRequestDeleted => {
                            response.sendStatus(200);
                            response.end();
                        }).catch(error => console.log(error));
                    }).catch(error => console.log(error));
                }).catch(error => console.log(error));
            } else {
                //query returned null i.e. friendRequest do not exists
                response.sendStatus(404);
                response.end();
            };
        })
        .catch(error => console.log(error));
    } else {
        //session invalid
        response.clearCookie('sessionid');
        response.redirect('/');
    };
});

APP.post('/chats/rejectfriendrequest', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        //delete this friendRequest
        DynamoDB.delete({
            TableName: 'friendRequests', 
            Key: {
                senderUsername: request.body.of.toLowerCase(),
                receiverUsername: response.locals.sessionUsername
            }
        }).promise()
        .then(data => {
            response.sendStatus(200);
            response.end();
        }).catch(error => {
            response.sendStatus(404);
            response.end();
        });
    } else {
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

APP.get('/chats/chatRequests', sessionAuthentication, (request,response) => {
    if (response.locals.sessionAuthenticated) { 
        // session validated
        // check if there is any friend requests
        let chatRequests = []; 
        DynamoDB.scan({
            TableName: 'friendRequests', 
            FilterExpression: 'contains(receiverUsername, :username)',
            ExpressionAttributeValues: {
                ':username': response.locals.sessionUsername
            }
        }).promise()
        .then(result => {
            if (result.Items != null) {
                //returned non empty list
                result.Items.forEach(friendRequest => {
                    chatRequests.push({
                        type: 'request',
                        from: friendRequest.senderUsername,
                        dateTime: friendRequest.when
                    });
                });
                response.send(JSON.stringify(chatRequests));
            }else {
                response.sendStatus(200);
                response.end();
            };
        }).catch(error => {
            response.sendStatus(404);
            response.end();
        });
    } else {
        // session invalid
        response.clearCookie('sessionid');
        response.clearCookie('username');
        response.redirect('/');
    };
});

function sessionAuthentication(request, response, next) {
    let sessionid = null, username = null;
    // check if session cookie exists or not 
    if (request.cookies != undefined) { 
        // normal http requests will hold cookie directly
        sessionid = request.cookies.sessionid;
        username = request.cookies.username;

    } else if ((request.cookies == undefined) && (request.headers.cookie != "")){
        // socket upgrade request and such will hold cookie in headers
        let cookiesList = request.headers.cookie.split(';');
        // request.headers.cookie might have only one cookie.
        cookiesList.forEach(cookie => {
            let thisCookie = cookie.split('=');
            thisCookie[0].trim();
            thisCookie[1].trim();
            if (thisCookie[0].toLowerCase() == "sessionid") {
                sessionid = thisCookie[1];
            } else if (thisCookie[0].toLowerCase() == "username") {
                username = thisCookie[1];
            };
        });
    };
    // did we find any session cookie
    if ((sessionid != null) && (username != null)) {
        DynamoDB.get({
            TableName: 'sessions', Key: {username: username},
            ConsistentRead: true, ProjectionExpression: 'username, recentSession'
        }).promise()
        .then(sessionData => {
            //session returned
            if ((sessionData.Item != null) && (sessionData.Item.recentSession == sessionid)) {
                console.log('Session AUTHENTICATED for '+username);
                response.locals.sessionAuthenticated = true;
                response.locals.sessionUsername = username;
                response.locals.sessionSessionid = sessionid;
                next();
            } else {
                //query returned unexpected results
                console.log('Session DENIED for '+username);
                response.locals.sessionAuthenticated = false;
                next();
            };
        })
        .catch(sessionError => { 
            console.log('Session DENIED for '+username);
            response.locals.sessionAuthenticated = false;
            next();
        });
    } else {
        // required cookies not found in request
        console.log('Session DENIED for a user');
        response.locals.sessionAuthenticated = false;
        next();
    };
};

// subscribe route
APP.post('/subscribe', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        //get push subscription object
        const subscription = request.body;
        // storing subscription info into database
        DynamoDB.update({
            TableName: 'users', 
            Key: {username: response.locals.sessionUsername}, 
            UpdateExpression: 'set notification = :subscription',
            ExpressionAttributeValues: {
                ':subscription': [subscription]
            }
        }).promise().then(result => {
            // send 201 - resource created
            response.status(201).json({});
            // create payload
            const payload = JSON.stringify({ title: 'Notification are now ON.'});
            // pass object into sendNotification
            WEBPUSH.sendNotification(subscription, payload).catch(error => console.error(error));
        }).catch(error => console.error(error));
    } else {
        response.clearCookie('username');
        response.clearCookie('sessionid');
        response.sendStatus(400);
    };
});

APP.get('/optOutPushNotification', sessionAuthentication, (request, response) => {
    if (response.locals.sessionAuthenticated) {
        DynamoDB.update({
            TableName: 'users', 
            Key: {username: response.locals.sessionUsername}, 
            UpdateExpression: 'remove notification'
        }).promise().then(result => {
            console.log('Result: '+result);
            // send 201 - resource created
            response.sendStatus(200);
            response.end();
        }).catch(error => console.error(error));
    } else {
        response.clearCookie('username');
        response.clearCookie('sessionid');
        response.sendStatus(400);
    };
});

function sendNotification(username, notification) {
    DynamoDB.get({
        TableName: 'users', 
        Key: {username: username},
        ProjectionExpression: 'username, notification'
    }).promise().then(data => {
        if ((data.Item.notification != undefined) && (data.Item.notification.length == 1 )) {
            //create subscription 
            let subscription = data.Item.notification[0];
            // create payload
            const payload = JSON.stringify({ title: notification.title, body: notification.body});
            // pass object into sendNotification
            WEBPUSH.sendNotification(subscription, payload).catch(error => console.error(error));
            console.log("Notification sent to "+data.Item.username);
        };
    }).catch(error => console.error(error));
};

// utility functions
function getTwoDigitValue(value) {
    return value < 10 ? '0' + value : '' + value;
};

function capitaliseFirstLetter(lowerCaseString) {
    if (typeof lowerCaseString == undefined) return;
    let firstLetter = lowerCaseString[0] || lowerCaseString.charAt(0);
    return firstLetter ? firstLetter.toUpperCase() + lowerCaseString.slice(1): '';
};

// websocket initiation
const SOCKET = new WS.Server({noServer: true, perMessageDeflate: false, clientTracking: true});

// upgrade protocol to websocket
SERVER.on('upgrade', (request, socket, head) => {
    const PATH = URL.parse(request.url).pathname;
    let sessionid = null;
    let username = null;
    // check if socket request path is correct 
    if(PATH == '/chats') {
        // check if cookies are available 
        if ((request.headers.cookie != null) && (request.headers.cookie != undefined)) {
            let cookiesList = request.headers.cookie.split(';');
            // request.headers.cookie might have only one cookie.
            cookiesList.forEach(cookie => {
                let thisCookie = cookie.split('=');
                if (thisCookie != null) {
                    thisCookie[0] = thisCookie[0].trim();
                    thisCookie[1] = thisCookie[1].trim();
                    if (thisCookie[0].toLowerCase() == "sessionid") {
                        sessionid = thisCookie[1];
                    } else if (thisCookie[0].toLowerCase() == "username") {
                        username = thisCookie[1];
                    };
                };
            });
        };
        if ((sessionid != null) && (username != null)) {
            // verify session from session database
            console.log('CONN UPGRADE request received from session: '+sessionid);
            DynamoDB.get({ TableName: 'sessions', Key: {username: username},
                ConsistentRead: true, ProjectionExpression: 'username, recentSession'
            }).promise()
            .then(sessionData => {
                //session returned
                if ((sessionData.Item != null) && (sessionData.Item.username == username)) {
                    console.log(sessionid+' is verified and is valid. Procedding to upgrade the conn');
                    SOCKET.handleUpgrade(request, socket, head, (socket) => {
                        // terminate this user's previous socket connection
                        SOCKET.clients.forEach(client => {
                            if (client.username === sessionData.Item.username) {
                                // previous socket found
                                client.terminate();
                            };
                        });

                        // add username and sessionid to this username's socket connection variable
                        socket.username = sessionData.Item.username;
                        socket.sessionid = sessionData.Item.recentSession;

                        // check for user's previous socket instance 
                        // if there, remove it and store new one
                        console.log('New Socket Conn for ' + socket.username + " added");
                        SOCKET.emit('connection', socket, request);
                    });
                   
                } else {
                    //query returned unexpected results
                    console.log('Session with id: '+sessionid+' is invalid. rejecting con upgrade request');
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                };
            })
            .catch(sessionError => { 
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            });
        } else {
            console.log('Unauthorizing socket connection');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        }
    } else { //socket request path is incorrect
        console.log("Socket conn path incorrect");
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    };
});

function heartbeat() {
    console.log("Pong received");
    this.is_Alive = true;
};

// websocket connection
SOCKET.on('connection', (socket, request, head) => {
    console.log("Socket Connection with a new user");
    let username = socket.username;
    socket.is_Alive = true;

    // on receiving message
    socket.on('message', ( message ) => {
        message = JSON.parse(message);
        if (message.purpose == 'chat-message') { 
            // for actual communication messages
            // check if reciever exist or not
            let receiver = message.to;
            let sender = username;
            DynamoDB.get({
                TableName: 'users', Key: {username: receiver}, 
                ConsistentRead: true, ProjectionExpression: 'username, friends'
            }).promise()
            .then(receiverData => {
                if (receiverData.Item != null) {
                    // receiver found - check if receiver has sender in his/her friends list
                    receiverData.Item.friends.forEach(friend => {
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
                                chatSrNo: parseInt(srYear+srMonth+srDate+srHours+srMinutes+srSeconds),
                                sender: sender,
                                dateAndTime: chatDateTime,
                                message: message.chat,
                                receipt: "sent",
                            };
                            message.time = chatDateTime;
                            // check if this user is online
                            SOCKET.clients.forEach(client => {
                                if (client.username == receiver) { // user is online
                                    message.from = username;
                                    client.send(JSON.stringify(message));
                                    chat.receipt = "delivered"
                                };
                            });
                            //send notification to receiver
                            sendNotification(receiver, {title: `Msg from ${username}`, body: message.chat});
                            // insert message to database
                            DynamoDB.put({
                                TableName: 'chats',
                                Item: chat
                            }).promise()
                            .then(data => {
                                console.log("Message added to database");
                            }).catch(error => console.log(error));   
                        };
                    });
                } else {
                    //receiver do not exists
                    socket.send(JSON.stringify({
                        from: "Error",
                        purpose: "Error",
                        error: "User does not exist"
                    }));
                };
            })
            .catch(error => console.log(error));
        };
    });

    //on pong
    socket.on('pong', heartbeat);

    // on close event
    SOCKET.on('close', () => {
        SOCKET.clients.forEach(client => {
            if (client.username == username) {
                console.log('Request to close a socket connection');
                client.terminate();
                console.log('Socket connection for a user closed');
            } else {
                console.log('User tried to close a non-existing socket connection');
            };
        }); 
    });

});

//send ping on interval of 30sec
const interval = setInterval(() => {
    console.log("Total socket connections now: "+SOCKET.clients.size);
    if (SOCKET.clients.size >= 1) {
        console.log("pinging clients");
        SOCKET.clients.forEach(client => {
            if (client.is_Alive === false) {
                return client.terminate();
            }
            client.is_Alive = false;
            client.ping(noop);
        });
    }; 
}, 30000);

//empty function serving as empty payload 
// for socket pings
function noop() {};

// DynamoDB.get({
//     TableName: 'friendRequests', 
//     Key: {
//         senderUsername: "nimish", 
//         receiverUsername: "prashant"
//     }
// }).promise()
// .then(data => {
//     console.log(data);
// }).catch(error => console.error(error));
