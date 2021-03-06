import * as vscode from "vscode";
import * as gravatar from "gravatar-api";
import { VSLS_SPACES_EXTENSION_ID, SelfCommands } from "../constants";
import { getExtension } from "../utils";

interface IMessage {
    type: string;
    content: string;
    timestamp: string;
    sender: string;
}

interface IUser {
    name: string;
    email: string;
}

const toMessage = (msg: IMessage) => ({
    timestamp: (Date.parse(msg.timestamp) / 1000.0).toString(),
    userId: msg.sender,
    text: msg.type === "info_message" ? `_${msg.content}_` : msg.content,
    content: undefined,
    reactions: [],
    replies: {}
});

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class VslsSpacesProvider implements IChatProvider {
    isListenerSetup: boolean = false;
    currentUser: IUser | undefined;

    constructor() {
        // Waiting for the extension to get activated
        setTimeout(() => {
            this.setupListeners();
        }, 5000);
    }

    setupListeners() {
        const extension = getExtension(VSLS_SPACES_EXTENSION_ID);

        if (extension && extension.isActive) {
            const exports = extension.exports;
            exports.setMessageCallback((data: any) => {
                this.onNewMessage(data);
            });
            exports.setSpaceCallback((name: string) => {
                this.onNewSpace(name);
            });
            exports.setClearMessagesCallback((name: string) => {
                this.onClearMessages(name);
            });
            exports.setUserChangedCallback(({ name, email }: IUser) => {
                this.connect();
            });

            this.isListenerSetup = true;
        }
    }

    async getApi() {
        let extension = getExtension(VSLS_SPACES_EXTENSION_ID)!;

        if (extension.isActive) {
            if (!this.isListenerSetup) {
                this.setupListeners();
            }

            return extension.exports;
        } else {
            await sleep(5000); // Give 5 secs for extension to activate

            extension = getExtension(VSLS_SPACES_EXTENSION_ID)!;
            return extension.exports;
        }
    }

    async connect(): Promise<CurrentUser | undefined> {
        const api = await this.getApi();

        if (api) {
            const userInfo: IUser | undefined = api.getUserInfo();

            if (userInfo) {
                const { name, email } = userInfo;
                this.currentUser = userInfo;
                return {
                    id: email,
                    name,
                    teams: [],
                    currentTeamId: undefined,
                    provider: Providers.vslsSpaces
                };
            }
        }
    }

    onNewMessage(data: any) {
        const { name, messages } = data;
        const chatMessages: Message[] = messages.map(toMessage);
        let channelMessages: ChannelMessages = {};
        chatMessages.forEach(msg => {
            channelMessages[msg.timestamp] = msg;
        });
        vscode.commands.executeCommand(SelfCommands.UPDATE_MESSAGES, {
            channelId: name,
            messages: channelMessages,
            provider: "vslsSpaces"
        });
    }

    onNewSpace(spaceName: string) {
        vscode.commands.executeCommand(SelfCommands.VSLS_SPACE_JOINED, {
            name: spaceName
        });
    }

    onClearMessages(spaceName: string) {
        vscode.commands.executeCommand(SelfCommands.CLEAR_MESSAGES, {
            channelId: spaceName,
            provider: "vslsSpaces"
        });
    }

    isConnected(): boolean {
        return !!this.currentUser;
    }

    async sendMessage(text: string, currentUserId: string, channelId: string) {
        const api = await this.getApi();
        api.sendMessage(channelId, text);
    }

    async fetchUsers(): Promise<Users> {
        const api = await this.getApi();
        const users: User[] = api.getUsers().map(({ name, email }: any) => {
            const avatar = gravatar.imageUrl({
                email,
                parameters: { size: "200", d: "retro" },
                secure: true
            });
            return {
                id: email,
                name,
                email,
                fullName: name,
                imageUrl: avatar,
                smallImageUrl: avatar,
                presence: UserPresence.available
            };
        });
        let usersToSend: Users = {};
        users.forEach(u => {
            usersToSend[u.id] = u;
        });
        return usersToSend;
    }

    async fetchUserInfo(userId: string): Promise<User | undefined> {
        const users = await this.fetchUsers();
        return users[userId];
    }

    async fetchChannels(users: Users): Promise<Channel[]> {
        const api = await this.getApi();
        const spaces = api.getSpaces();
        const channels: Channel[] = spaces.map((name: string) => ({
            id: name,
            name,
            type: ChannelType.channel,
            readTimestamp: undefined,
            unreadCount: 0
        }));
        return channels;
    }

    async loadChannelHistory(channelId: string) {
        const api = await this.getApi();
        const messages: IMessage[] = await api.getChannelHistory(channelId);
        const chatMessages: Message[] = messages.map(toMessage);
        let channelMessages: ChannelMessages = {};
        chatMessages.forEach(msg => {
            channelMessages[msg.timestamp] = msg;
        });
        return channelMessages;
    }

    subscribePresence(users: Users) {}

    getUserPreferences(): Promise<UserPreferences> {
        return Promise.resolve({});
    }

    async validateToken(): Promise<CurrentUser | undefined> {
        return;
    }

    async fetchChannelInfo(channel: Channel): Promise<Channel | undefined> {
        return undefined;
    }

    async markChannel(
        channel: Channel,
        ts: string
    ): Promise<Channel | undefined> {
        return undefined;
    }

    async fetchThreadReplies(
        channelId: string,
        ts: string
    ): Promise<Message | undefined> {
        return undefined;
    }

    async sendThreadReply(
        text: string,
        currentUserId: string,
        channelId: string,
        parentTimestamp: string
    ) {}

    async updateSelfPresence(
        presence: UserPresence,
        durationInMinutes: number
    ) {
        return undefined;
    }

    async createIMChannel(user: User): Promise<Channel | undefined> {
        return undefined;
    }

    async destroy() {}

    async sendTyping(currentUserId: string, channelId: string) { }
}
