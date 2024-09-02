import { IChatJoinProperties } from "./bifrost/Events";
import { Intent, WeakEvent } from "matrix-appservice-bridge";
import * as crypto from "crypto";

export class Util {

    public static MINUTE_MS = 60000;

    public static createRemoteId(protocol: string, id: string): string {
        return `${protocol}://${id}`;
    }

    public static passwordGen(minLength: number = 32): string {
        let password = "";
        while (password.length < minLength) {
            // must be printable
            for (const char of crypto.randomBytes(32)) {
                if (char >= 32 && char <= 126) {
                    password += String.fromCharCode(char);
                }
            }
        }
        return password;
    }

    public static sanitizeProperties(props: IChatJoinProperties): IChatJoinProperties {
        for (const k of Object.keys(props)) {
            const value = props[k];
            const newkey = k.replace(/\./g, "·");
            delete props[k];
            props[newkey] = value;
        }
        return props;
    }

    public static desanitizeProperties(props: IChatJoinProperties): IChatJoinProperties {
        for (const k of Object.keys(props)) {
            const value = props[k];
            const newkey = k.replace(/·/g, ".");
            delete props[k];
            props[newkey] = value;
        }
        return props;
    }

    public static unescapeUserId(userId: string): string {
        return userId.replace(/(=[0-9a-z]{2})/g, (code) =>
            String.fromCharCode(parseInt(code.substr(1), 16)),
        );
    }

    public static async getMessagesBeforeJoin(
        intent: Intent, roomId: string): Promise<WeakEvent[]> {
        const client = intent.matrixClient;
        const { chunk } = await client.doRequest("GET", `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`, {dir: 'b'});
        // eslint-disable-next-line no-underscore-dangle
        const msgs: WeakEvent[] = [];
        for (const msg of chunk.reverse()) {
            // This is our membership
            if (msg.type === "m.room.member" && msg.sender === client.getUserId()) {
                break;
            }
            if (msg.type === "m.room.message") {
                msgs.push(msg);
            }
        }
        return msgs;
    }
}
