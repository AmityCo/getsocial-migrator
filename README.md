# GetSocial Migrator 🔄

GetSocial Migrator is a command-line tool 🖥️ designed to migrate your groups, users, comments, and reactions data from the GetSocial system to Amity Social Cloud (ASC). This powerful tool makes the transition smoother and easier.

## 📖 Table of Contents
- [🔧 Installation](#installation)
- [📝 Usage](#usage)
- [⚙️ Characteristics and Limitations](#characteristics-and-limitations)
- [📝 Logging](#logging)

## 🔧 Installation
Kickstart the migration process by cloning this repository. Once done, install the required dependencies using the following command:
```bash
npm i
```

## 📝 Usage

Launch the migrator tool by using the below command:

```bash
npm run start
```

The tool will then prompt you for the necessary details to facilitate migration:

- `App ID`: App ID of GetSocial.
- `API Key`: API Key of GetSocial.
- `Auth Identity`: The identifier key used to identify the user identity in GetSocial (such as 'email'). This is used to migrate users from the `user.authIdentities` object in GetSocial. For example, if Auth Identity is set to `email`, the migrator tool will identify GetSocial users based on the value in `user.authIdentities.email`. Users with the same value will be recognized as the same user and will not be migrated twice.
- `Amity Social Cloud Region`: The region of the Amity Social Cloud system where your app is located.
- `Amity Social Cloud API Key`: Your API key for the Amity Social Cloud system.
- `Amity Social Cloud Admin Token`: Your Admin Token for the Amity Social Cloud system.

Once all these details are filled in, the system will prompt you to select the group you wish to migrate. Upon selection, it will be created as a Community in Amity Social Cloud with its associated members, posts, comments, and reactions.

![image](https://github.com/AmityCo/getsocial-migrator/assets/1589163/21c6a1c0-de57-45b1-b165-43ccb7e75611)

## ⚙️ Characteristics and Limitations

The GetSocial Migrator tool operates under certain specifications and limitations that are crucial to understand:

### 📥 Migration Support
- **Users Migration**: The migration tool operates on a group-by-group basis. Consequently, users who aren't associated with any group cannot be migrated.
- **Approved Entities**: Only approved members and posts are migrated.
- **Unsupported Entities**: Topic and poll posts aren't supported.
- **Partial Migration**: Action buttons and mention data from GetSocial aren't migrated.
- **Unsupported Reactions**: Reactions on comments aren't supported.
- **Unsupported Comment Replies**: Multi-level comment replies using `target` aren't migrated.
- **Followers Migration**: Followers are migrated along with all follow relationships of any group members being migrated.
- **Follow Relation Group**: Follow relation group (users who follow group instead of joining group) is not migrated.

### 🔄 Metadata and Data Conversion
- **Labels to Tags**: Labels from GetSocial are converted to tags in ASC.
- **Auth Identities Migration**: The `authIdentities` of GetSocial users are migrated to metadata in ASC.
- **User Properties**: User's public and private properties are migrated and merged into User's `metadata` object.
- **Activities Properties Migration**: GetSocial activities' properties are transferred into the metadata of the corresponding object (post, comment) in ASC.

### 📸 User Profile Avatars
- **Uploaded Avatars Migration**: User profile avatars uploaded to GetSocial are migrated and reuploaded to ASC.
- **External Avatars**: User profile avatars using external links are moved to `customAvatarUrl` in ASC, but the image files aren't migrated to ASC.

### 📑 Post and Comment Types
- **Supported Types**: Text, image, and video posts/comments are supported.
- **Video-Image Posts**: Posts with both video and image are converted into videos only, with images dropped from the migration.
- **Media Files Migration**: All images and videos in posts and comments are migrated and reuploaded to ASC.
- **Admin Posts Migration**: Posts and comments created by the GetSocial admin are migrated as created by the Admin that owns the ASC Admin token.

### ✔️ Idempotency
- The system is idempotent, ensuring that groups, users, posts, comments, and reactions that have already been migrated won't be re-migrated. This makes it safe to re-run the migrator without causing duplication.

## 📝 Logging
Debug logs are maintained in the `output.log` file, and any errors are tracked in the `error.log` file. These files should be regularly checked to get detailed information about each migration process and to troubleshoot errors.
