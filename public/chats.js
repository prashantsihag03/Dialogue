if (window.location.href.split(':')[0] != "https") {
    let reloadWithHTTPS = window.location.href.replace("http", "https");
    window.location.assign(reloadWithHTTPS);
}; 

checkWorker();

let friends = [];
let CurrentConversationWith = "";
let newFriendAdded = true;
let PublicVapidKey = "BBxNm2U1QIOK9B_plf_39HojOsU4hVmnwW13qHPd8y4dw-F8Xi2rM1eIX-xu_IfoI0ckzUOVvaET5p9MzMbyWH8";
displayConversation();

// initiate web socket connection
var HOST = location.origin.replace(/^https/, 'wss');
const WEBSOCKET = new WebSocket(HOST+'/chats'); 


// websocket connection open
WEBSOCKET.addEventListener('open', (evnt) => {
    console.log("Web Socket Connection live");
    document.getElementById("loading").style.display = "none";
});


WEBSOCKET.addEventListener('close', (socket, e) => {
    document.getElementById("loading").style.display = "flex";
    document.querySelector("#loader > p").innerHTML = "Connection Closed";
});

WEBSOCKET.addEventListener('error', (socket, e) => {
    document.getElementById("loading").style.display = "flex";
    document.querySelector("#loader > p").innerHTML = "Connection Error";
});

// websocket receives message
WEBSOCKET.addEventListener('message', (message) => {
    console.log('Receiving messages from server.....');
    data = JSON.parse(message.data);
    if ((data.purpose == "chat-message")){
        if (CurrentConversationWith == data.from) {
            displayReceivedChatMessage(true, data.from, data.chat, data.time);
        };
    }
});

// sending message
let sendMessage = document.getElementById('submit');
sendMessage.addEventListener('click', () => {
    console.log("Sending message....");
    let actualMsg = document.getElementById('msgBox').value;
    let recipientName = CurrentConversationWith;
    if (recipientName == "") {
        console.log("No recipient selected.")
        return
    }
    let message = {
        purpose: "chat-message",
        to: recipientName, 
        chat: actualMsg
    };
    WEBSOCKET.send(JSON.stringify(message));
    document.getElementById('msgBox').value = "";
    let time = new Date();
    displayReceivedChatMessage(false, "me", message.chat, time);
    let element = document.getElementById("messages");
    element.scrollTop = element.scrollHeight - element.clientHeight;
});

// display account menu
let showAccountMenu;
document.getElementById('profilepic').addEventListener('click', ()=> {
    if (showAccountMenu == true){
        showAccountMenu = false;
        document.getElementById('accountmenus').style.display = "none";
    } else {
        showAccountMenu = true;
        document.getElementById('accountmenus').style.display = "flex";
    };
});

let showFriendList; 
document.getElementById("friends").addEventListener('click', ()=> {
    if (showFriendList == true) {
        showFriendList = false;
        document.getElementById('friendsList').style.display = "none";
        document.getElementById("friends").style.borderColor = "lightcoral";
        
    } else {
        showFriendList = true;
        document.getElementById('friendsList').innerHTML = "";
        document.getElementById("friends").style.borderColor = "steelblue";
        document.getElementById('friendsList').style.display = "flex";
        // fetch friends list 
        if (newFriendAdded) {
            fetch('/chats/myfriends').then(fetchResponse => fetchResponse.json())
            .then(data => {
                if (data.length >= 1) {// refresh friendslist here
                    friends = [];
                    data.forEach(friend => {
                        friends.push(friend);
                        addElementInFriendsList(friend);
                    });
                } else {
                    let friendsList = document.getElementById('friendsList');
                    friendsList.innerHTML = "No friends yet."
                };
                newFriendAdded = false;
            });
        } else {
            if (friends != null) {
                friends.forEach(friend => {
                    addElementInFriendsList(friend);
                });
            } else {
                let friendsList = document.getElementById('friendsList');
                friendsList.innerHTML = "No friends yet."
            };
        };
    };
});

// display Chat Requests 
let showChatRequests;
document.getElementById('chatRequests').addEventListener('click', ()=> {
    if (showChatRequests == true){
        showChatRequests = false;
        document.getElementById('chatRequestsresult').style.display = "none";
    } else {
        showChatRequests = true;
        updateChatRequests();
        document.getElementById('chatRequestsresult').style.display = "flex";
    };
});

// search user
let fetchingFriendsTimeoutInitialization = false;
let searchbar = document.getElementById('searchbar');
searchbar.oninput = () => {
    if (fetchingFriendsTimeoutInitialization) {
        clearTimeout(fetchingFriends);
    };
    if (searchbar.value.length < 1) {
        document.getElementById('searchresult').style.display = "none";
    } else {
        fetchingFriendsTimeoutInitialization = true;
        fetchingFriends = setTimeout(() => {
            document.getElementById('searchresult').innerHTML = "";
            let user = searchbar.value;
            if (searchbar.value.length >= 1) {
                // fetch users from server here
                fetch(`/chats/searchuser/${user}`)
                .then(response => {
                    if (response.status == 200) {
                        response.json().then(result => {
                            result.forEach(user => {
                                createSearchResultInstance(user);
                            });
                        });
                    };
                });
                // display in searchresult element
                document.getElementById('searchresult').style.display = "flex";
            }
        }, 2000);
    };
};
