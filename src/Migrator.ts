import axios, { AxiosError } from "axios";

import { GSArrayResponse, GSGroup, GSPost, GSUser, getGroupMembers, getGroupPosts, getPostComments, getPostReactions, getUserFollowers } from "./GetSocial";
import { ASCCommunity, ASCConfig, ASCPost, ASCResponse, addUsersToCommunity, followUser, groupAlreadyExist, migrateComment, migrateGroupAsCommunity, migratePost, migrateReaction, migrateUser } from "./AmitySocialCloud";
import * as cliProgress from 'cli-progress';
export interface MigrationContext extends ASCConfig {
    appId: string;
    apiKey: string;
    authIdentity: string;
    multibar: cliProgress.MultiBar,
    logger: any
}


// export async function migrateUsers(appId: string, apiKey: string, groupId: string) {
//     const members = await getGroupMembers(appId, apiKey, groupId);
//     console.log(`Migrating ${members.length} users from group ${groupId} to group ${newGroupId}`);
//     for (const member of members) {
//         await addUserToGroup(appId, apiKey, newGroupId, member.user.id);
//     }
// }

export async function migrateGroup(mconfig: MigrationContext, group: GSGroup) {
    let community = await groupAlreadyExist(mconfig, group.id);
    if (!community) {
        mconfig.logger.debug(`Group ${group.id} does not exist in ASC. Migrating Group as Community...\n`);
        community = await migrateGroupAsCommunity(mconfig, group);
    }
    else{
        mconfig.logger.debug(`Group ${group.id} already exists in ASC. Skipping.\n`);
    }
    // Migrate members
    await migrateMembers(mconfig, group, community);
    // Migrate posts
    await migratePosts(mconfig, group, community);

}


async function migratePosts(mconfig: MigrationContext, group: GSGroup, community: ASCCommunity) {
    mconfig.logger.debug(`Migrating posts from group ${group.id}\n`);
    let totalReactionCount = 0;
    let totalPostCount = 0;
    let totalCommentCount = 0;
    mconfig.logger.debug("Fetching posts from group " + group.id + "\n");
    let postData = await getGroupPosts(mconfig.appId, mconfig.apiKey, group.id);
    totalPostCount += postData.data.length;

    const postMigrateProgressBar = mconfig.multibar.create(totalPostCount, 0);
    postMigrateProgressBar.update(0, { title: 'Migrating Posts', "unit": "posts" });

    const reactionMigrateProgressBar = mconfig.multibar.create(totalReactionCount, 0);
    reactionMigrateProgressBar.update(0, { title: 'Migrating Reactions', "unit": "reactions" });

    const commentMigrateProgressBar = mconfig.multibar.create(totalReactionCount, 0);
    commentMigrateProgressBar.update(0, { title: 'Migrating Comments', "unit": "comments" });

    let isFirst = true;
    while (isFirst || postData?.next_cursor) {
        if (!isFirst) {
            mconfig.logger.debug("fetching more posts from group " + group.id + "\n");
            postData = await getGroupPosts(mconfig.appId, mconfig.apiKey, group.id, postData?.next_cursor);
            postMigrateProgressBar.setTotal(totalPostCount += postData.data.length);
        }
        isFirst = false;
        const posts = postData.data;
        await Promise.all(posts.map(async post => {
            // Migrate user
            const ascPost = await migratePost(mconfig, community, post);
            mconfig.logger.debug("ASCPOST: "+JSON.stringify(ascPost));
            if (!ascPost) {
                mconfig.logger.error("Error migrating post " + post.id + " from group " + group.id + ". Skipping.");
                return;
            }
            totalCommentCount += post.comments_count || 0;
            mconfig.logger.debug("postId: "+post.id+" commentcount: "+post.comments_count+'\n');
            commentMigrateProgressBar.setTotal(totalCommentCount);
            for (const key in post.reactions_count) {
                if (post.reactions_count.hasOwnProperty(key)) {
                    totalReactionCount += post.reactions_count[key];
                }
                reactionMigrateProgressBar.setTotal(totalReactionCount);
            }
            await migrateReactions(mconfig, reactionMigrateProgressBar, post, ascPost);
            await migrateComments(mconfig, commentMigrateProgressBar, post, ascPost);
            postMigrateProgressBar.increment();
        }));
    }
}

async function migrateReactions(mconfig: MigrationContext, reactionMigrateProgressBar: cliProgress.SingleBar, gsPost: GSPost, ascPost: ASCPost) {
    mconfig.logger.debug("Fetching reactions from post " + gsPost.id + "\n");
    let reactionData = await getPostReactions(mconfig.appId, mconfig.apiKey, gsPost.id);
    let isFirst = true;
    while (isFirst || reactionData?.next_cursor) {
        if (!isFirst) {
            mconfig.logger.debug("fetching more reactions from post " + gsPost.id + "\n");
            reactionData = await getPostReactions(mconfig.appId, mconfig.apiKey, gsPost.id);
        }
        isFirst = false;
        const reactions = reactionData.reactions;
        await Promise.all(reactions.map(async reaction => {
            // Migrate reaction
            mconfig.logger.debug("REACTION: "+JSON.stringify(reaction));
            await migrateReaction(mconfig, reaction.author.user, ascPost, reaction.reactions[0]);
            reactionMigrateProgressBar.increment();
        }));
    }
}
async function migrateComments(mconfig: MigrationContext, commentMigrateProgressBar: cliProgress.SingleBar, gsPost: GSPost, ascPost: ASCPost) {
    mconfig.logger.debug("Fetching comments from post " + gsPost.id + "\n");
    let commentData = await getPostComments(mconfig.appId, mconfig.apiKey, gsPost.id);
    let isFirst = true;
    while (isFirst || commentData?.next_cursor) {
        if (!isFirst) {
            mconfig.logger.debug("fetching more comments from post " + gsPost.id + "\n");
            commentData = await getPostComments(mconfig.appId, mconfig.apiKey, gsPost.id);
        }
        isFirst = false;
        const comments = commentData.data;
        for(let i = 0 ; i < comments.length ; i++){
            const comment = comments[i];
            if (i < ascPost.commentsCount) {
                mconfig.logger.debug("Skipping comment " + comment.id + " from post " + gsPost.id + " because it already exists in ASC\n");
            }
            else {
                // Migrate non-admin comment
                if(comment.author.user) await migrateComment(mconfig, comment.author.user, ascPost, comment);
                else mconfig.logger.debug("Skipping comment " + comment.id + " from post " + gsPost.id + " because it is an admin comment\n");
            }
            commentMigrateProgressBar.increment();
        }
    }

}


async function migrateMembers(mconfig: MigrationContext, group: GSGroup, community: ASCCommunity) {
    mconfig.logger.debug(`Migrating ${group.members_count} users from group ${group.id}`);
    const userMigrateProgressBar = mconfig.multibar.create(group.members_count, 0);
    const userJoinProgressBar = mconfig.multibar.create(group.members_count, 0);
    const userFollowProgressBar = mconfig.multibar.create(0, 0);
    userMigrateProgressBar.update(0, { title: 'Migrating Users', "unit": "users" });
    userJoinProgressBar.update(0, { title: 'Joining Users', "unit": "users" });
    userFollowProgressBar.update(0, { title: 'Following Users', "unit": "users" });
    let memberData = null;
    while (!memberData || memberData?.next_cursor) {
        memberData = await getGroupMembers(mconfig.appId, mconfig.apiKey, group.id, memberData?.next_cursor);
        const members = memberData.data;
        await Promise.all(members.map(async member => {
            // Migrate user
            await migrateUser(mconfig, member.user);
            userMigrateProgressBar.increment();
            const followers = await getUserFollowers(mconfig, member.user);
            userMigrateProgressBar.setTotal(userMigrateProgressBar.getTotal() + followers.length);
            userFollowProgressBar.setTotal(userFollowProgressBar.getTotal() + followers.length);
            await Promise.all(followers.map(async follower => {
                await migrateUser(mconfig, follower);
                userMigrateProgressBar.increment();
            }));
            await Promise.all(followers.map(async follower => {
                await followUser(mconfig, member.user, follower.id);
                userFollowProgressBar.increment();
            }));

        }));
        await addUsersToCommunity(mconfig, community.communityId, members.map(member => member.user.id));
        userJoinProgressBar.increment(members.length);
    }
}


