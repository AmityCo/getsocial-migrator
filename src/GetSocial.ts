import axios from "axios";
import { MigrationContext } from "./Migrator";
import Bottleneck from "bottleneck";

const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 1000
});
export interface GSUserMembership {
    membership: GSMembership;
    user: GSUser;
}
export type GSUser = {
    id: string;
    auth_identities: { [key: string]: string };
    display_name: string;
    avatar_url: string;
    private_properties: Record<string, unknown>;
    public_properties: Record<string, unknown>;
    is_verified: boolean;
    can_moderate: boolean;
}

export interface GSMembership {
    created_at: number;
    role: string;
    status: string;
}

export type GSGroup = {
    avatar_url: string;
    description: {
        en: string;
    };
    followers_count: number;
    id: string;
    is_discoverable: boolean;
    is_private: boolean;
    labels: string[];
    members_count: number;
    permissions: {
        interact: "admin" | "user";
        post: "admin" | "user";
    };
    properties: {
        [key: string]: string;
    };
    title: {
        en: string;
    };
};

export interface GSArrayResponse<T>{
    data: T[];
    next_cursor?: string
};
export interface GSArrayResponseWithTotalNumber<T> extends GSArrayResponse<T> {
    total_number: number
}
export type GSReactionArrayResponse = {
    reactions: GSReaction[];
    next_cursor?: string
};

export interface GSPost extends GSActivity {
    content_type: 'post';
}
export interface GSComment extends GSActivity {
    content_type: 'comment';
}

export interface GSContent{
    attachments?: { image?: string, video?: string }[];
    button?: {
        action: {
            data: { $url: string };
            type: string;
        };
        title: string;
    };
    language: string;
    text: string;
}

export interface GSActivity{
    author: {
        is_app: boolean;
        is_verified: boolean;
        user: GSUser
    };
    comments_count?: number;
    content: GSContent[];
    content_type: string;
    created_at: number;
    id: string;
    properties: Record<string, unknown>;
    reactions_count: Record<string, number>
    source: {
        id: {
            id: string;
            type: string;
        };
    };
    status: string;
    status_updated_at: number;
    labels?: string[];
};

export type GSReaction = {
    author: {
        is_app: boolean;
        is_verified: boolean;
        user: GSUser
    }
    reactions: string[]
};



export async function getGroups(mconfig: MigrationContext): Promise<GSGroup[]> {
    const requestBody = JSON.stringify({
        "app_id": mconfig.appId
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.getsocial.im/v1/communities/groups/search',
        headers: {
            'X-GetSocial-API-Key': mconfig.apiKey,
            'Content-Type': 'application/json'
        },
        data: requestBody
    };
    const { data } = (await limiter.schedule(() =>  axios.request(config))).data as GSArrayResponse<GSGroup>;
    return data;
}

export async function getUserFollowers(mconfig: MigrationContext, user: GSUser, cursor?: string){

    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.getsocial.im/v1/communities/followers?app_id=${mconfig.appId}&entity_type=user&entity_id=${user.id}&limit=10${cursor ? `&next_cursor=${cursor}` : ''}`,
        headers: {
            'X-GetSocial-API-Key': mconfig.apiKey,
            'Content-Type': 'application/json'
        }
    };
    const { data } = (await limiter.schedule(() =>  axios.request(config))).data as GSArrayResponseWithTotalNumber<GSUser>;
    return data;
}

export async function getGroupMembers(appId: string, apiKey: string, groupId: string, cursor?: string): Promise<GSArrayResponse<GSUserMembership>> {
    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.getsocial.im/v1/communities/groups/members?app_id=${appId}&id=${groupId}&limit=10&status=approved${cursor ? `&next_cursor=${cursor}` : ''}`,
        headers: {
            'X-GetSocial-API-Key': apiKey,
            'Content-Type': 'application/json'
        }
    };
    const memberData = (await limiter.schedule(() =>  axios.request(config))).data as GSArrayResponse<GSUserMembership>;
    return memberData;
}
export async function getGroupPosts(appId: string, apiKey: string, groupId: string, cursor?: string): Promise<GSArrayResponse<GSPost>> {
    let data = JSON.stringify({
        "app_id": appId,
        "withPolls": "onlyWithoutPolls",
        "status": "approved",
        "target": {
            "type": "group",
            "id": groupId
        }
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.getsocial.im/v1/communities/activities/search',
        headers: {
            'X-GetSocial-API-Key': apiKey,
            'Content-Type': 'application/json'
        },
        data: data
    };

    const postData = (await limiter.schedule(() =>  axios.request(config))).data as GSArrayResponse<GSPost>;
    return postData
}

export async function getPostReactions(appId: string, apiKey: string, postId: string, cursor?: string): Promise<GSReactionArrayResponse> {

    let config = {
        method: 'get',
        maxBodyLength: Infinity,
        url: `https://api.getsocial.im/v1/communities/activities/reactions?app_id=${appId}&id=${postId}&limit=10${cursor ? `&next_cursor=${cursor}` : ''}`,
        headers: {
            'X-GetSocial-API-Key': apiKey,
            'Content-Type': 'application/json'
        }
    };

    const reactionData = (await limiter.schedule(() =>  axios.request(config))).data as GSReactionArrayResponse;
    return reactionData
}

export async function getPostComments(appId: string, apiKey: string, postId: string, cursor?: string): Promise<GSArrayResponse<GSComment>> {

    const requestBody : any = JSON.stringify({
        "app_id": appId,
        "status" : "approved",
        "target" : {
            "type": "activity",
            "id": postId
        }
    });
    if(cursor) requestBody.next_cursor = cursor;
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://api.getsocial.im/v1/communities/activities/search`,
        headers: {
            'X-GetSocial-API-Key': apiKey,
            'Content-Type': 'application/json'
        },
        data: requestBody
    };

    const reactionData = (await limiter.schedule(() =>  axios.request(config))).data as GSArrayResponse<GSComment>;
    return reactionData
}
