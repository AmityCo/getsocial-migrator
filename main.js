
const axios = require("axios");
async function authUser(email) {
  let data = JSON.stringify({
    app_id: "7fL0706tT8fR",
    identity_type: "email",
    value: email,
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url:
      "https://api.getsocial.im/v1/authenticate/user?app_id=7fL0706tT8fR&identity_type=email&value=" +
      email +
      "&token=t1234",
    headers: {
      accept: "application/json",
      Authorization: "Bearer a4c800603b5748570d526f5a2a03ecfd77ff3d70",
      "Content-Type": "application/json",
    },
    data: data,
  };

  return (await axios.request(config)).data;
}

async function addMemberToGroup(email, group) {
  let data = JSON.stringify({
    app_id: "7fL0706tT8fR",
    group_id: group,
    users: [
      {
        provider: "email",
        user_id: email,
      },
    ],
    role: "admin",
    status: "approved",
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://api.getsocial.im/v1/communities/groups/members",
    headers: {
      "X-GetSocial-API-Key": "222642cb71fbc21c88dbfd1ec8c84451",
      "Content-Type": "application/json",
    },
    data: data,
  };

  return (await axios.request(config)).data;
}

Promise.resolve().then(async () => {
  const group = "groupc";
  for (let i = 20; i < 40; i++) {
    const email = `gsct${i}@gmail.com`;
    console.log(await authUser(email));
    console.log(await addMemberToGroup(email, group));
  }
});
