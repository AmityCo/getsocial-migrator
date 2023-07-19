import axios, { AxiosError } from "axios";
import { GSComment, GSGroup, GSPost, GSUser } from "./GetSocial";
import stream from 'stream';
import { promisify } from 'util';
import Bottleneck from "bottleneck";
import { MigrationContext } from "./Migrator";
const pipeline = promisify(stream.pipeline);


const FormData = require('form-data')
const limiter = new Bottleneck({
    maxConcurrent: 10,
    minTime: 1000
});
export type ASCAttachment = { fileId: string, type: 'image' | 'video' }
export type ASCConfig = {
    ascRegion: string;
    ascApiKey: string;
    ascAdminToken: string;
}
export interface ASCComment {
    _id: string;
    path: string;
    commentId: string;
    userId: string;
    parentId: string;
    rootId: string;
    referenceId: string;
    referenceType: string;
    dataType: string;
    dataTypes: string[];
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;
    childrenNumber: number;
    flagCount: number;
    reactions: ASCReaction;
    reactionsCount: number;
    myReactions: string[];
    isDeleted: boolean;
    editedAt: string;
    createdAt: string;
    updatedAt: string;
    children: string[];
    segmentNumber: number;
    attachments: ASCAttachment[];
}

export type ASCReaction = Record<string, number>

export interface ASCResponse {
    communities: ASCCommunity[],
    users: ASCUser[],
    posts: ASCPost[],
}


export interface ASCPost {
    _id: string;
    path: string;
    sharedCount: number;
    targetType: string;
    dataType: string;
    commentsCount: number;
    editedAt: string;
    createdAt: string;
    updatedAt: string;
    isDeleted: boolean;
    hasFlaggedComment: boolean;
    hasFlaggedChildren: boolean;
    data: {
        text: string;
    };
    postId: string;
    postedUserId: string;
    targetId: string;
    flagCount: number;
    hashFlag: null;
    reactions: ASCReaction;
    reactionsCount: number;
    myReactions: string[];
    feedId: string;
    mentionees: string[];
    tags: string[];
    attachments: ASCAttachment[];
}


export interface ASCCommunity {
    _id: string;
    path: string;
    communityId: string;
    channelId: string;
    userId: string;
    displayName: string;
    avatarFileId: string;
    description: string;
    isOfficial: boolean;
    isPublic: boolean;
    onlyAdminCanPost: boolean;
    tags: string[];
    metadata: Record<string, unknown>;
    postsCount: number;
    membersCount: number;
    isJoined: boolean;
    categoryIds: string[];
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    hasFlaggedComment: boolean;
    hasFlaggedPost: boolean;
    needApprovalOnPostCreation: boolean;
    moderatorMemberCount: number;
}

export type ASCUser = {
    _id: string;
    path: string;
    userId: string;
    roles: string[];
    permissions: string[];
    displayName: string;
    description: string;
    avatarFileId: string;
    avatarCustomUrl: string;
    flagCount: number;
    hashFlag: {
        bits: number;
        hashes: number;
        hash: number[];
    };
    metadata: Record<string, unknown>; // 'Record' is a generic type that can be used to represent an object structure
    isGlobalBan: boolean;
    createdAt: string; // If you're going to convert this string to a Date object, you might want to represent it as Date instead
    updatedAt: string; // Same as above
}

export async function migrateGroupAsCommunity(mconfig: MigrationContext, group: GSGroup) {
    const avatarFileId = await migrateImage(mconfig, group.avatar_url);
    mconfig.logger.debug(`Creating group ${group.id} in ASC...\n`);
    const requestBody = {
        "displayName": group.title.en,
        "description": group.description.en,
        "tags": [`gsId=${group.id}`],
        "isPublic": !group.is_private,
        "onlyAdminCanPost": false,// group.permissions.post === "admin",
        "metadata": {
            "gsId": group.id
        },
        "avatarFileId": avatarFileId
    }
    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://api.${mconfig.ascRegion}.amity.co/api/v3/communities`,
        headers: {
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(requestBody)
    };
    const respData = (await limiter.schedule(() => axios.request(config))).data as ASCResponse;
    mconfig.logger.debug(`Group ${group.id} created in ASC with response ${JSON.stringify(respData, null, 2)}\n`);
    return respData.communities[0];
}

export async function groupAlreadyExist(mconfig: MigrationContext, groupId: string) {
    const gsIdTag = `gsId=${groupId}`;
    mconfig.logger.debug(`Checking if group ${groupId} exists in ASC...\n`);
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.${mconfig.ascRegion}.amity.co/api/v3/communities?tags[0]=${gsIdTag}`,
        headers: {
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
            'Content-Type': 'application/json'
        }
    };
    try {
        const { communities } = (await limiter.schedule(() => axios.request(config))).data as ASCResponse;
        // Find communities whose tags contain gsId=group.id
        const existingGroup = communities.find(community => community.tags.includes(gsIdTag));
        return existingGroup;
    }
    catch (err) {
        if (err instanceof AxiosError) {
            mconfig.logger.error(`Error checking if group ${groupId} exists in ASC: ${JSON.stringify(err?.response?.data, null, 2)}`);
        }
        else mconfig.logger.error((err as Error).stack);
        throw err;
    }

}

export async function postAlreadyExists(mconfig: MigrationContext, targetType: string, targetId: string, gsPostId: string) {
    const gsIdTag = `gsId=${gsPostId}`;
    const config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.${mconfig.ascRegion}.amity.co/api/v4/posts?targetType=${targetType}&&targetId=${targetId}&&tags[0]=${gsIdTag}`,
        headers: {
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
            'Content-Type': 'application/json'
        }
    };
    // console.log(`Checking if getsocial postId ${gsPostId} exists in ASC...config: `, config);
    try {
        const { posts } = (await limiter.schedule(() => axios.request(config))).data as ASCResponse;
        // Find communities whose tags contain gsId=group.id
        const existingPost = posts?.find(post => post.tags.includes(gsIdTag));
        return existingPost;
    }
    catch (err) {
        if (err instanceof AxiosError) {
            console.log(`Error checking if post ${gsPostId} exists in ASC: ${JSON.stringify(err?.response?.data, null, 2)}`);
        }
        else mconfig.logger.error((err as Error).stack);
        throw err;
    }

}

export async function migrateImage(mconfig: MigrationContext, fileUrl: string): Promise<string | null> {

    try {
        // console.log("Uploading image to ASC with URL: ", fileUrl);
        // Download image from the internet
        const { data: fileStream } = await axios.get(fileUrl, { responseType: 'stream' });

        // Prepare form data
        let formData = new FormData();
        formData.append('files', fileStream);

        // Prepare headers
        const headers = {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
        };
        // Make the request
        const response = await limiter.schedule(() => axios.post(`https://api.${mconfig.ascRegion}.amity.co/api/v4/images`, formData, { headers }));
        // console.log("Image uploaded with file data: ", response.data[0]);
        return response.data[0].fileId;
    } catch (error) {
        mconfig.logger.error('Error migrating image ' + fileUrl + ' error:' + error);
        return null;
    }
}

export async function migrateVideo(mconfig: MigrationContext, fileUrl: string): Promise<string | null> {
    try {
        // console.log("Uploading video to ASC with URL: ", fileUrl);
        // Download image from the internet
        const { data: fileStream } = await axios.get(fileUrl, { responseType: 'stream' });

        // Prepare form data
        let formData = new FormData();
        formData.append('files', fileStream);

        // Prepare headers
        const headers = {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
        };
        // Make the request
        const response = await limiter.schedule(() => axios.post(`https://api.${mconfig.ascRegion}.amity.co/api/v4/videos`, formData, { headers }));
        // console.log("Video uploaded with file data: ", response.data[0]);
        return response.data[0].fileId;
    } catch (error) {
        mconfig.logger.error('Error migrating video ' + fileUrl + ' error:' + error);
        return null;
    }
}

export async function addUsersToCommunity(mconfig: ASCConfig, communityId: string, userIds: string[]) {
    let data = JSON.stringify({
        userIds
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://api.${mconfig.ascRegion}.amity.co/api/v3/communities/${communityId}/users`,
        headers: {
            'accept': 'application/json',
            'Authorization': 'Bearer ' + mconfig.ascAdminToken,
            'Content-Type': 'application/json'
        },
        data: data
    };

    await limiter.schedule(() => axios.request(config));
}

export async function getUserAccessToken(mconfig: ASCConfig, user: GSUser): Promise<string> {
    // Setup the headers
    const headers = {
        'Content-Type': 'application/json',
        'X-API-KEY': mconfig.ascApiKey
    };

    // Create session
    const sessionRequest = {
        userId: user.id,
        deviceId: `getsocial-migrator-${user.id}`,
        deviceInfo: {
            kind: 'web',
            model: 'getsocial-migrator',
            sdkVersion: '1.0'
        },
        displayName: user.display_name
    };
    // console.log("Registering session with config: ", sessionRequest);
    const sessionResponse = await axios.post(`https://api.${mconfig.ascRegion}.amity.co/api/v3/sessions`,
        sessionRequest, { headers });
    return sessionResponse.data.accessToken;

}
export async function migrateUser(mconfig: MigrationContext, user: GSUser) {
    mconfig.logger.debug("Migration user: ", user);
    try {
        await getUserAccessToken(mconfig, user);
        let avatarCustomUrl: string | undefined = undefined, avatarFileId: string | undefined = undefined;
        if (user.avatar_url) {
            if (user.avatar_url.startsWith("https://cdn.getsocial.im/"))
                avatarFileId = (await migrateImage(mconfig, user.avatar_url)) || undefined;
            else
                avatarCustomUrl = user.avatar_url;
        }

        // Setup the headers
        const headers = {
            'Authorization': `Bearer ${mconfig.ascAdminToken}`,
            'Content-Type': 'application/json',
            'X-API-KEY': mconfig.ascApiKey
        };
        // Update user information
        const userUpdateRequest = {
            userId: user.id,
            displayName: user.display_name,
            roles: user.can_moderate ? ['moderator'] : [],
            metadata: { ...user.public_properties, ...user.private_properties, [mconfig.authIdentity]: user.auth_identities[mconfig.authIdentity] },
            avatarCustomUrl, avatarFileId
        };
        // console.log("Updating user with config: ", userUpdateRequest);

        const userUpdateResponse = (await axios.put(`https://api.${mconfig.ascRegion}.amity.co/api/v3/users`,
            userUpdateRequest, { headers })).data as ASCResponse;
        return userUpdateResponse.users.find(u => u.userId === user.id);
    }
    catch (err) {

        if (err instanceof AxiosError) {
            mconfig.logger.error(`Error while migrating user: ${JSON.stringify(err?.response?.data, null, 2)}`);
        }
        else throw err;
    }

}

export async function followUser(mconfig: MigrationContext, user: GSUser, followTarget: string){
    mconfig.logger.debug(`Adding Follow from ${user.id} to ${followTarget}\n`);
    try {

        const accessToken = await getUserAccessToken(mconfig, user);

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://api.${mconfig.ascRegion}.amity.co/api/v4/me/following/${followTarget}`,
            headers: {
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            }
        };
        const resp = await limiter.schedule(() => axios.request(config));
    }
    catch (err) {
        if (err instanceof AxiosError) {
            // if error body.message is "Follow request is already accepted" then ignore
            if (err?.response?.data?.message && err?.response?.data?.message.includes("already accepted")) {
                mconfig.logger.debug(`Follow request from ${user.id} to ${followTarget} already exists, skipping\n`);
                return;
            }
            mconfig.logger.error(`Error while migrating reaction: ${JSON.stringify(err?.response?.data, null, 2)}`);
            console.error(err.response);
        }
        else throw err;
    }

}

export async function migratePost(mconfig: MigrationContext, community: ASCCommunity, post: GSPost) {
    mconfig.logger.debug(`Migration post: ${post.id}\n`);
    try {

        // Skip migration if post already exists
        const existingPost = await postAlreadyExists(mconfig, 'community', community.communityId, post.id);
        if (existingPost) {
            mconfig.logger.debug(`Post ${post.id} already exists in ASC, skipping migration\n`);
            return existingPost;
        }

        // migrate images and videos from content attachments and create attachments array with the returned fileIds
        let attachments: ASCAttachment[] = (await Promise.all(post.content[0]?.attachments?.map(async (a) => {
            if (a.image && !a.video) {
                return {
                    fileId: await migrateImage(mconfig, a.image),
                    type: "image"
                }
            }
            else if (a.video) {
                return {
                    fileId: await migrateVideo(mconfig, a.video),
                    type: "video"
                }
            }
        }) ?? [])).filter(a => !!a?.fileId) as ASCAttachment[];

        // if video exist in attachments, remove all attachment with type = 'image'
        if (attachments.find(a => a.type === "video")) {
            const hasOtherType = attachments.find(a => a.type !== "video");
            if (hasOtherType) {
                mconfig.logger.debug(`Post ${post.id} has video mixed with other type of attachments: ${attachments.map(a => a.type)}, removing them\n`);
            }
            attachments = attachments.filter(a => a.type === "video");
        }

        // set text to the first .text that is valid in content array
        const text = post.content.find(c => !!c.text)?.text;
        const tags = [`gsId=${post.id}`];
        if (post.labels) tags.push(...post.labels.filter(l => !!l));
        const metadata: Record<string, unknown> = {};
        for (const key in post.properties) {
            if (post.properties.hasOwnProperty(key) && /^[a-z0-9]/i.test(key)) {
                metadata[key] = post.properties[key];
            }
        }
        if (post.content[0]?.language) {
            metadata['language'] = post.content[0]?.language;
            tags.push(`language=${post.content[0]?.language}`);
        }

        const accessToken = post.author.user.id ? (await getUserAccessToken(mconfig, post.author.user)) : mconfig.ascAdminToken;
        const data = JSON.stringify({
            "data": {
                text
            },
            attachments: (attachments.length > 0 ? attachments : undefined),
            tags,
            metadata,
            "createdAt": new Date(post.created_at * 1000).toISOString(),
            "targetType": "community",
            "targetId": community.communityId
        });

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://api.${mconfig.ascRegion}.amity.co/api/v4/posts`,
            headers: {
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            data: data
        };
        mconfig.logger.debug("Creating post " + post.id + '\n')
        const resp = await limiter.schedule(() => axios.request(config));
    }
    catch (err) {
        mconfig.logger.error("Error: "+(err as Error).stack);
        if (err instanceof AxiosError && err?.response?.data) {
            mconfig.logger.error(`Error while migrating post:`, err?.response?.data);
        }
        throw err;
    }
}
export async function migrateReaction(mconfig: MigrationContext, user: GSUser, post: ASCPost, reaction: string) {
    mconfig.logger.debug(`Migrating reaction of postId: ${post.postId}\n`);
    try {

        const accessToken = user ? (await getUserAccessToken(mconfig, user)) : mconfig.ascAdminToken;
        
        const data = JSON.stringify({
            "referenceId": post.postId,
            "referenceType": "post",
            "reactionName": reaction
        });

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://api.${mconfig.ascRegion}.amity.co/api/v2/reactions`,
            headers: {
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            data: data
        };
        const resp = await limiter.schedule(() => axios.request(config));
    }
    catch (err) {

        if (err instanceof AxiosError) {
            mconfig.logger.error(`Error while migrating reaction: ${JSON.stringify(err?.response?.data, null, 2)}`);
            console.error(err.response);
        }
        else throw err;
    }

}
export async function migrateComment(mconfig: MigrationContext, user: GSUser, post: ASCPost, comment: GSComment) {
    try {
        // migrate images and videos from content attachments and create attachments array with the returned fileIds
        let attachments: ASCAttachment[] = (await Promise.all(comment.content[0]?.attachments?.map(async (a) => {
            if (a.image && !a.video) {
                return {
                    fileId: await migrateImage(mconfig, a.image),
                    type: "image"
                }
            }
            else if (a.video) {
                return {
                    fileId: await migrateVideo(mconfig, a.video),
                    type: "video"
                }
            }
        }) ?? [])).filter(a => !!a?.fileId) as ASCAttachment[];

        // if video exist in attachments, remove all attachment with type = 'image'
        if (attachments.find(a => a.type === "video")) {
            const hasOtherType = attachments.find(a => a.type !== "video");
            if (hasOtherType) {
                mconfig.logger.debug(`Comment ${comment.id} has video mixed with other type of attachments: ${attachments.map(a => a.type)}, removing them\n`);
            }
            attachments = attachments.filter(a => a.type === "video");
        }

        // set text to the first .text that is valid in content array
        const text = comment.content.find(c => !!c.text)?.text;
        const metadata: Record<string, unknown> = {};
        metadata['gsId'] = comment.id;
        for (const key in comment.properties) {
            if (comment.properties.hasOwnProperty(key) && /^[a-z0-9]/i.test(key)) {
                metadata[key] = comment.properties[key];
            }
        }
        if (comment.content[0]?.language) {
            metadata['language'] = comment.content[0]?.language;
        }

        const accessToken = await getUserAccessToken(mconfig, user);

        const data = JSON.stringify({
            "referenceId": post.postId,
            "referenceType": "post",
            "data": {
                text
            },
            metadata,
            createdAt: new Date(comment.created_at * 1000).toISOString(),
            attachments: (attachments.length > 0 ? attachments : undefined)
        });

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://api.${mconfig.ascRegion}.amity.co/api/v3/comments`,
            headers: {
                'accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            data: data
        };
        const resp = await limiter.schedule(() => axios.request(config));
    }
    catch (err) {

        if (err instanceof AxiosError) {
            mconfig.logger.error(`Error while migrating user: ${JSON.stringify(err?.response?.data, null, 2)}`);
        }
        else throw err;
    }

}