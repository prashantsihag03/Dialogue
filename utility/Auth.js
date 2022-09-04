function sessionAuthentication(request, response, next) {
  let sessionid = null,
    username = null;
  // check if session cookie exists or not
  if (request.cookies != undefined) {
    // normal http requests will hold cookie directly
    sessionid = request.cookies.sessionid;
    username = request.cookies.username;
  } else if (request.cookies == undefined && request.headers.cookie != "") {
    // socket upgrade request and such will hold cookie in headers
    let cookiesList = request.headers.cookie.split(";");
    // request.headers.cookie might have only one cookie.
    cookiesList.forEach((cookie) => {
      let thisCookie = cookie.split("=");
      thisCookie[0].trim();
      thisCookie[1].trim();
      if (thisCookie[0].toLowerCase() == "sessionid") {
        sessionid = thisCookie[1];
      } else if (thisCookie[0].toLowerCase() == "username") {
        username = thisCookie[1];
      }
    });
  }
  // did we find any session cookie
  if (sessionid != null && username != null) {
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
          sessionData.Item.recentSession == sessionid
        ) {
          console.log("Session AUTHENTICATED for " + username);
          response.locals.sessionAuthenticated = true;
          response.locals.sessionUsername = username;
          response.locals.sessionSessionid = sessionid;
          next();
        } else {
          //query returned unexpected results
          console.log("Session DENIED for " + username);
          response.locals.sessionAuthenticated = false;
          next();
        }
      })
      .catch((sessionError) => {
        console.log("Session DENIED for " + username);
        response.locals.sessionAuthenticated = false;
        next();
      });
  } else {
    // required cookies not found in request
    console.log("Session DENIED for a user");
    response.locals.sessionAuthenticated = false;
    next();
  }
}

module.exports = {
  sessionAuthentication,
};
