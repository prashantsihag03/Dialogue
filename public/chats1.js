function displayConversation() {
    if (CurrentConversationWith == "") {
        document.getElementsByTagName("main")[0].style.display = "none";
        document.getElementById("no-main-overlay").style.display = "flex";
    } else {
        document.getElementsByTagName("main")[0].style.display = "flex";
        document.getElementById("no-main-overlay").style.display = "none";
        displayPreviousConversation(CurrentConversationWith); 
    };
};

function displayPreviousConversation(withUsername) {
    // fetch previous conversations 
    fetch(`/chats/previousChats/${withUsername}`)
    .then(fetchResult => fetchResult.json())
    .then(previousChats => {
        if (previousChats.type == "Error") {
            console.log("Error displaying previous conversation with this user");
        } else {
            previousChats = previousChats.sort((a, b) => {
                return a.srno - b.srno;
            });        
            console.log(previousChats);
            previousChats.forEach(chat => {
                if (chat.sender == CurrentConversationWith){
                    displayReceivedChatMessage(true, chat.sender, chat.message, chat.dateAndTime);
                } else {
                    displayReceivedChatMessage(false, chat.sender, chat.message, chat.dateAndTime);
                };
            })
        };
    });
};

function displayReceivedChatMessage( isMessageReceived,receivedFrom, receivedMessage, receivedTime) {
    //***** Received Time must be a UTC date time variable *******/
    msgTime = new Date(receivedTime);
    let time = msgTime.getDate()+ '/' + (msgTime.getMonth()+1)+' ' + msgTime.getHours() + ':' + msgTime.getMinutes(); 

    // create container on DOM
    let msgSection = document.getElementById('messages');

    // container to hold complete message
    let msgContainer = document.createElement('div');

    // create div to hold sender name
    let chatMsgName = document.createElement('div');
    chatMsgName.setAttribute("id", "chat-msg-name");
    chatMsgName.innerHTML = receivedFrom;

    // create div container for message and time Status
    let chatMsg = document.createElement('div');

    // hold actual message
    let chatMsgMessage = document.createElement('div');
    chatMsgMessage.setAttribute("id", "chat-msg-message");
    chatMsgMessage.appendChild(document.createTextNode(receivedMessage));

    // div to hold time and status divs
    let chatMsgTimeStatus = document.createElement('div');
    chatMsgTimeStatus.setAttribute("id", "chat-msg-time-status");

    // div to hold time
    let chatMsgTime = document.createElement('div');
    chatMsgTime.setAttribute("id", "chat-msg-time");
    chatMsgTime.appendChild(document.createTextNode(time));

    if (isMessageReceived) {
        msgContainer.setAttribute("id", "msg-container-left");
        chatMsg.setAttribute("id", "chat-msg-left");
        
    } else {
        msgContainer.setAttribute("id", "msg-container-right");
        chatMsg.setAttribute("id", "chat-msg-right");
    }

    // appending everything
    chatMsgTimeStatus.appendChild(chatMsgTime);
    
    chatMsg.appendChild(chatMsgMessage);
    chatMsg.appendChild(chatMsgTimeStatus);

    msgContainer.appendChild(chatMsgName);
    msgContainer.appendChild(chatMsg);

    msgSection.appendChild(msgContainer);

    // scroll to the end of the element
    let element = document.getElementById("messages");
    element.scrollTop = element.scrollHeight - element.clientHeight;
};

function sendFriendRequest(to, imgElement) {
    console.log(imgElement);
    console.log(to);
    let options = {
        method: "post", 
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({to: to})
    };
    fetch('/chats/sendfriendrequest', options)
    .then(response => {
        if (response.status == 200) {
            imgElement.setAttribute('src', 'RequestSent.svg');
        } else if (response.status == 403) {
            imgElement.setAttribute('src', 'RequestSent.svg'); 
        } else {
            console.log('Error sending friend request. Try again later');
        };
    });
};

function createSearchResultInstance(user) {
    // create p element
    let resultContainer = document.createElement('p');

    // create profile pic img element
    let profilePic = document.createElement('img');
    profilePic.setAttribute('src', 'defaultprofile.svg');
    profilePic.setAttribute('alt', 'profile picture');
    profilePic.setAttribute('value', user.username);

    let usernameAnchor = document.createElement('a');
    usernameAnchor.setAttribute('id', 'searchUser-username');
    usernameAnchor.setAttribute('value', user.username);
    usernameAnchor.innerHTML = user.username;

    // append above elements
    resultContainer.appendChild(profilePic);
    resultContainer.appendChild(usernameAnchor);

    if (friends.includes({friendName: user.username})) {
        //this user is friend
        let friend = document.createElement('img');
        sendRequest.setAttribute('src', 'friend.svg');
        resultContainer.appendChild(friend);
        resultContainer.addEventListener("click", () => {
            console.log("addEventlistener fired 1");
            // popUpSearchUserProfile(user.username, true);
        });
    } else {
        resultContainer.addEventListener("click", () => {
            popUpSearchUserProfile(user.username, false);
        });
    }
    document.getElementById('searchresult').appendChild(resultContainer);
};

function popUpSearchUserProfile(searchUserName, isFriend) {
    if (isFriend) {
        console.log("addEventlistener fired 2");
        showPopUpForThisUser(searchUserName, "friend");
    } else {
        fetch(`/chats/getUserProfile/${searchUserName}`).then(response => {
            if (response.status == 200) {
                response.json().then(data => {
                    console.log(data);
                    if (data.sent) {
                        // request already sent to this user
                        console.log("addEventlistener fired 2");
                        showPopUpForThisUser(searchUserName, "sent");
                    } else if (data.received) {
                        console.log("addEventlistener fired 2");
                        // request received from this user
                        showPopUpForThisUser(searchUserName, "received");
                    } else {
                        console.log("addEventlistener fired 4");
                        // not request echange with this user
                        showPopUpForThisUser(searchUserName, "add");
                    };
                }).catch(error => console.log(error));
            } else {
                showPopUpForThisUser(searchUserName, "error");
            }
        }).catch(error => console.log(error));
    }
    
};

function showPopUpForThisUser(username, requestState) {
    if (document.getElementsByClassName('popUpUser')[0] != undefined) {
        document.getElementsByClassName('popUpUser')[0].remove();
    };

    let popUpUserContainer = document.createElement('div');
    popUpUserContainer.setAttribute('class', 'popUpUser');

    if (requestState == "error") {
        let failed = document.createElement('div');
        failed.setAttribute('id', 'failed');
        popUpUserContainer.appendChild(failed);
        document.getElementsByTagName('body')[0].appendChild(popUpUserContainer);
        return
    };

    let pictureContainer = document.createElement('div');
    pictureContainer.setAttribute('class', 'picture');
    let profilePic = document.createElement('img');
    profilePic.setAttribute('src', 'defaultprofile.svg');
    pictureContainer.appendChild(profilePic);
    popUpUserContainer.appendChild(pictureContainer);

    let p = document.createElement('p');
    p.innerHTML = username;
    popUpUserContainer.appendChild(p);

    if (requestState == "sent") {
        let requestContainer = document.createElement('div');
        requestContainer.setAttribute('class', 'container-requestImg');
        let requestImg = document.createElement('img');
        requestImg.setAttribute('src', 'RequestSent.svg');
        requestContainer.appendChild(requestImg);
        popUpUserContainer.appendChild(requestContainer);

    } else if (requestState == "received") {
        let requestContainer = document.createElement('div');
        requestContainer.setAttribute('class', 'container-requestImg-received');
        let requestImgAccept = document.createElement('img');
        requestImgAccept.setAttribute('src', 'RequestReceivedAccept.svg');
        requestImgAccept.addEventListener('click', () => {
            acceptFriendRequest(username, requestImgAccept);
            // change the name of container-requestImg-Received to without received
        });
        requestContainer.appendChild(requestImgAccept);
        let requestImgReject = document.createElement('img');
        requestImgReject.setAttribute('src', 'RequestReceivedReject.svg');
        requestImgReject.addEventListener('click', () => {
            rejectFriendRequest(username, requestImgReject);
            // change the name of container-requestImg-Received to without received
        });
        requestContainer.appendChild(requestImgReject);
        popUpUserContainer.appendChild(requestContainer);

    } else if (requestState == "friend") {
        let requestContainer = document.createElement('div');
        requestContainer.setAttribute('class', 'container-requestImg');
        let requestImg = document.createElement('img');
        requestImg.setAttribute('src', 'friend.svg');
        requestImg.addEventListener('click', () => {
            // remove from friend list
        });
        requestContainer.appendChild(requestImg);
        popUpUserContainer.appendChild(requestContainer);
    } else {
        // show send button to send friend request to this
        let requestContainer = document.createElement('div');
        requestContainer.setAttribute('class', 'container-requestImg');
        let requestImg = document.createElement('img');
        requestImg.setAttribute('src', 'addFriend.svg');
        requestImg.addEventListener('click', () => {
            sendFriendRequest(username, requestImg);
        });
        requestContainer.appendChild(requestImg);
        popUpUserContainer.appendChild(requestContainer);
    };

    let closeBtn = document.createElement('div');
    closeBtn.setAttribute('id', 'closePopUp');
    closeBtn.innerHTML = "X";
    closeBtn.addEventListener('click', () => {
        document.getElementsByClassName('popUpUser')[0].remove();
    });
    popUpUserContainer.appendChild(closeBtn);
    document.getElementsByTagName('body')[0].appendChild(popUpUserContainer);
};

function addElementInFriendsList(name) {
    //container holding all friends in DOM
    let friendsList = document.getElementById('friendsList');
    // container to hold one friend from friendList
    let elementContainingFriend = document.createElement('li');
    elementContainingFriend.setAttribute('value', name);
    let FriendName = document.createElement('div');
    FriendName.setAttribute('id', 'friendName');
    FriendName.innerHTML = name.toUpperCase();
    // container to hold this Friend's status 
    let FriendStatus = document.createElement('div');
    FriendStatus.setAttribute('id', 'friendStatus');
    
    // append all this friend's elements to friendsList
    elementContainingFriend.appendChild(FriendName);
    elementContainingFriend.appendChild(FriendStatus);
    elementContainingFriend.addEventListener('click', ()=>{
        // fetch element value
        let newConversation = name;
        if (newConversation != CurrentConversationWith) {
            document.getElementById('messages').innerHTML = "";
            CurrentConversationWith = newConversation;
            document.getElementById('receiver').innerHTML = "In conversation with "+CurrentConversationWith.toUpperCase();
            console.log("displaying conversation with "+CurrentConversationWith)
            displayConversation();
        } else {
            document.getElementById('messages').innerHTML = "";
            console.log("Updating conversation with "+CurrentConversationWith);
            displayConversation();
        };
    });

    //append this friend's container to friendList in DOM
    friendsList.appendChild(elementContainingFriend);
};

function updateChatRequests() {
    // fetch ChatRequest from server here
    document.getElementById('others').innerHTML = "";
    fetch('/chats/chatRequests')
    .then(response => {
        if (response.status == 304) {
            // not modified
            console.log("No new chatRequests received")
        } else {
            // new chatRequests 
            response.json().then(allChatRequests => {
                console.log(allChatRequests.length+" new chat requests");
                allChatRequests.forEach(chatRequest => {
                    console.log(chatRequest);
                    addElementToChatRequests(chatRequest);
                });
            });
        };
    });
};

function addElementToChatRequests(ChatRequest) {
    if (ChatRequest.type == "request") {
        // this is a new friend request
        let container = document.createElement('p');
        // user profile pic
        let usernamePic = document.createElement('img');
        usernamePic.setAttribute('src', 'defaultprofile.svg');
        // user name
        let usernameAnchor = document.createElement('a');
        usernameAnchor.setAttribute('id', 'chatsrequests-username');
        usernameAnchor.innerHTML = ChatRequest.from.toUpperCase();
        // accept svg
        let acceptSVG = document.createElement('img');
        acceptSVG.setAttribute('src', 'RequestReceivedAccept.svg');
        acceptSVG.setAttribute('id', 'chatrequests-accept');
        acceptSVG.addEventListener('click', ()=>{
            acceptFriendRequest(ChatRequest.from, acceptSVG);
        });
        // reject svg
        let rejectSVG = document.createElement('img');
        rejectSVG.setAttribute('src', 'RequestReceivedReject.svg');
        rejectSVG.setAttribute('id', 'chatrequests-reject');
        rejectSVG.addEventListener('click', ()=>{
            rejectFriendRequest(ChatRequest.from, rejectSVG);
        });
        // append all to container
        container.appendChild(usernamePic);
        container.appendChild(usernameAnchor);
        container.appendChild(acceptSVG);
        container.appendChild(rejectSVG);

        let ChatRequestElement = document.getElementById('others');
        ChatRequestElement.appendChild(container);
    };
};

function acceptFriendRequest(userToAccept, element) {
    let options = {
        method: "post", 
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({of: userToAccept})
    };
    fetch('/chats/acceptfriendrequest', options)
    .then(response => {
        if (response.status == 200) {
            element.nextElementSibling.remove();
            element.remove();
            newFriendAdded = true;
        };
    });
};

function rejectFriendRequest(userToReject, element) {
    console.log(userToReject);
    let options = {
        method: "post", 
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({of: userToReject})
    };
    fetch('/chats/rejectfriendrequest', options)
    .then(response => {
        if (response.status == 200) {
            console.log('request successfully rejected');
            element.previousElementSibling.remove();
            element.remove();
        } else {
            console.log("Request couldn't be rejected");
        };
    });
};

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
  
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
  
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

//registering service worker, web push, send push
function registerPUSH() {
    navigator.serviceWorker.getRegistration('/').then(registration => {
        registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PublicVapidKey)
        })
        .then(subscription => {
            console.log("Push registered. sending push now");
            fetch('/subscribe', {
                method: 'POST',
                body: JSON.stringify(subscription),
                headers: {
                    'content-type': 'application/json'
                } 
            }).then(response => {
                if (response.status == 201) {
                    console.log('Push subscribed...');
                    return true;
                } else {
                    console.log('Error while subscribing push')
                };
            }).catch(error => {return false});
        }).catch(error => {
            console.error(error);
            return false;
        });
    })
};

function notificationPreferenceBtn(btnElement, text, value, color) {
    btnElement.innerHTML = text;
    btnElement.value = value;
    btnElement.style.backgroundColor = color;
}

function checkWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration('/').then(registration => {
            if (registration == undefined) {
                // register worker
                navigator.serviceWorker.register('/worker.js', {scope: '/'})
                .then(registration => {
                    console.log("SW registered");
                }).catch(error => {
                    console.error("SW registration failed");
                });
            } else {
                console.log("SW already registered");
                if (registration.active.state == "activated") {
                    console.log("and is activated");
                } else {
                    console.log("but isn't activated");
                };
            }; 
        });
    };
};
