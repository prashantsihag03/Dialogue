let NotiPreferenceBtn = document.getElementById("msgNotiPreferenceBtn");

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration('/').then(registration => {
        if ((registration != undefined) && (registration.active.state == "activated"))  {
            // worker is registered and activated
            registration.pushManager.getSubscription().then(subscription => {
                if (subscription == null) {
                    notificationPreferenceBtn(NotiPreferenceBtn, "Notification's OFF", "OFF", "maroon");
                } else {
                    registration.pushManager.permissionState().then(permission => {
                        if (permission == "granted") {
                            notificationPreferenceBtn(NotiPreferenceBtn, "Notification's ON", "ON", "green");
                        } else {
                            notificationPreferenceBtn(NotiPreferenceBtn, "Notification's Permission Not Granted", "OFF", "maroon");
                        };
                    }).catch(error => console.error(error));
                };
            })
        } else if (registration == undefined) {
            //worker is not registered 
            notificationPreferenceBtn(NotiPreferenceBtn, "Notification's OFF", "OFF", "maroon");
        };
    }).catch(error => console.error(error));

    NotiPreferenceBtn.addEventListener('click', () => {
        NotiPreferenceBtn.style.zIndex = "-1000"; 
        if (NotiPreferenceBtn.value == "ON") {
            //notifications are ON, turn it off now by unregistering push subscription
            navigator.serviceWorker.getRegistration('/').then(registration => {
                registration.pushManager.getSubscription().then(subscription => {
                    subscription.unsubscribe().then(unsubscribed => {
                        if (unsubscribed) {
                            fetch('/optOutPushNotification').then(response => {
                                if (response.status == 200) {
                                    console.log('Push Notification successfully stopped');
                                };
                                notificationPreferenceBtn(NotiPreferenceBtn, 
                                    "Notification's OFF", "OFF", "maroon");
                                NotiPreferenceBtn.style.zIndex = "1"; 
                            }).catch(error => console.error(error));
                        } else {
                            console.log("Browser error while removing push notification subscription")
                            notificationPreferenceBtn(NotiPreferenceBtn, 
                                "Browser Error", "ON", "green");
                        };
                    }).catch(error => console.error(error));
                }).catch(error => console.error(error));
            }).catch(error => console.error(error));
        } else {
            //notifications are OFF, turn it on now by subscribing push notifications, 
            navigator.serviceWorker.getRegistration('/').then(registration => {
                registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(PublicVapidKey)
                }).then(subscription => {
                    fetch('/subscribe', {
                        method: 'POST',
                        body: JSON.stringify(subscription),
                        headers: {
                            'content-type': 'application/json'
                        } 
                    }).then(response => {
                        if (response.status == 201) {
                            console.log('Push subscribed...');
                            notificationPreferenceBtn(NotiPreferenceBtn, 
                                "Notification's ON", "ON", "darkseagreen");
                            NotiPreferenceBtn.style.zIndex = "1"; 
                        } else {
                            console.log('Error while subscribing push');
                        };
                    }).catch(error => {
                        notificationPreferenceBtn(NotiPreferenceBtn, 
                            "Notification Failed", "OFF", "grey");
                        NotiPreferenceBtn.style.zIndex = "1"; 
                    });
                }).catch(error => {
                    console.error(error);
                    notificationPreferenceBtn(NotiPreferenceBtn, 
                        "Notification Failed", "OFF", "grey");
                    NotiPreferenceBtn.style.zIndex = "1"; 
                });
            }).catch(error => console.error(error));           
        };
    });
} else {
    notificationPreferenceBtn(NotiPreferenceBtn, 
        "Notification Not Available", "OFF", "grey");
    NotiPreferenceBtn.style.zIndex = "1"; 
};