function sendNotification(username, notification) {
  DynamoDB.get({
    TableName: "users",
    Key: { username: username },
    ProjectionExpression: "username, notification",
  })
    .promise()
    .then((data) => {
      if (
        data.Item.notification != undefined &&
        data.Item.notification.length == 1
      ) {
        //create subscription
        let subscription = data.Item.notification[0];
        // create payload
        const payload = JSON.stringify({
          title: notification.title,
          body: notification.body,
        });
        // pass object into sendNotification
        WEBPUSH.sendNotification(subscription, payload).catch((error) =>
          console.error(error)
        );
        console.log("Notification sent to " + data.Item.username);
      }
    })
    .catch((error) => console.error(error));
}

module.exports = {
  sendNotification,
};
