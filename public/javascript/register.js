function checkWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration("/").then((registration) => {
      if (registration == undefined) {
        // register worker
        navigator.serviceWorker
          .register("/worker.js", { scope: "/" })
          .then((registration) => {
            console.log("SW registered");
          })
          .catch((error) => {
            console.error("SW registration failed");
          });
      } else {
        console.log("SW already registered");
        if (registration.active.state == "activated") {
          console.log("and is activated");
        } else {
          console.log("but isn't activated");
        }
      }
    });
  }
}
checkWorker();

const login = document.forms[1];
const signup = document.forms[0];
var toggleFormBtn = document.getElementById("toggleForm");
let formActive = "login";

const signupContainer = document.getElementById("signup-container");
const loginContainer = document.getElementById("login-container");

document.getElementById("logo").addEventListener("click", () => {
  location.reload();
});

window.addEventListener("resize", () => {
  if (window.innerWidth >= "800") {
    signupContainer.style.height = "100%";
    loginContainer.style.height = "100%";
  } else {
    if (formActive == "login") {
      //display login
      loginContainer.style.height = "100%";
      signupContainer.style.height = "0%";
      toggleFormBtn.innerHTML = "Signup";
      toggleFormBtn.style.backgroundColor = "steelblue";
      formActive = "login";
    } else {
      //display signup
      signupContainer.style.height = "100%";
      loginContainer.style.height = "0%";
      toggleFormBtn.innerHTML = "Login";
      toggleFormBtn.style.backgroundColor = "lightcoral";
      formActive = "signup";
    }
  }
});

login.addEventListener("submit", (e) => {
  e.preventDefault();
  let loginformValid;
  //validation
  if (login.username.value == "") {
    login.children[0].innerHTML = "this field is required";
    loginformValid = false;
  } else {
    login.children[0].innerHTML = "";
    loginformValid = true;
  }
  if (login.password.value == "") {
    login.children[2].innerHTML = "this field is required";
    loginformValid = false;
  } else {
    //validate values here
    if (login.password.value.length < 4) {
      login.children[2].innerHTML = "password must be atleast 8 letters long";
      loginformValid = false;
    } else {
      //good to go
      login.children[2].innerHTML = "";
      loginformValid = true;
    }
  }
  if (loginformValid) {
    login.submit();
  }
});

signup.addEventListener("submit", (e) => {
  let signupformValid;
  e.preventDefault();
  // validation
  if (signup.username.value.trim() == "") {
    signup.children[0].innerHTML = "this field is required";
    signupformValid = false;
  } else {
    fetch("/usernameAvailability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: signup.username.value.trim() }),
    }).then((response) => {
      if (response.status == 302) {
        signup.children[0].innerHTML = "Username already taken";
        signupformValid = false;
      } else if (response.status == 404) {
        signup.children[0].innerHTML = "";
        signupformValid = true;
      }
    });
  }
  if (signup.password.value.trim() == "") {
    signup.children[2].innerHTML = "this field is required";
    signupformValid = false;
  } else {
    //validate values here
    if (signup.password.value.length < 8) {
      signup.children[2].innerHTML = "Must include atleast 8 letters";
      signupformValid = false;
    } else {
      //good to go
      signup.children[2].innerHTML = "";
      signupformValid = true;
    }
  }
  if (signup.email.value == "") {
    login.children[4].innerHTML = "this field is required";
    signupformValid = false;
  } else {
    //validate values here
    signup.children[4].innerHTML = "";
    signupformValid = true;
  }
  if (signup.gender.value == "") {
    signup.children[6].innerHTML = "this field is required";
    signupformValid = false;
  } else {
    if (signup.gender.value == "male" || signup.gender.value == "female") {
      signup.children[6].innerHTML = "";
      signupformValid = true;
    } else {
      signup.children[6].innerHTML = "wrong input";
      signupformValid = false;
    }
  }
  if (signupformValid) {
    signup.submit();
  }
});

toggleFormBtn.addEventListener("click", toggleForm);

function toggleForm() {
  if (formActive == "login") {
    //display signup
    signupContainer.style.height = "100%";
    loginContainer.style.height = "0%";
    toggleFormBtn.innerHTML = "Login";
    toggleFormBtn.style.backgroundColor = "lightcoral";
    formActive = "signup";
  } else {
    //display login
    loginContainer.style.height = "100%";
    signupContainer.style.height = "0%";
    toggleFormBtn.innerHTML = "Signup";
    toggleFormBtn.style.backgroundColor = "steelblue";
    formActive = "login";
  }
}
