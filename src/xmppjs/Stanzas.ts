/* eslint-disable max-classes-per-file */
import { v4 as uuid } from "uuid";
import * as he from "html-entities";
import { IBasicProtocolMessage } from "../MessageFormatter";
import { XMPPFeatures, XMPPStatusCode } from "./XMPPConstants";
import { createHash } from "crypto";

export const NODE_NAME = "https://github.com/matrix-org/matrix-bifrost";

function encode(text) {
    return he.encode(text, { level: "xml", mode: "nonAscii"});
}

export interface IStza {
    type: string;
    xml: string;
}

export enum PresenceRole {
    None = "none",
    Visitor = "visitor",
    Participant = "participant",
    Moderator = "moderator",
}

export enum PresenceAffiliation {
    None = "none",
    Outcast = "outcast",
    Member = "member",
    Admin = "admin",
    Owner = "owner",
}

export abstract class StzaBase implements IStza {
    private hFrom: string = "";
    private hTo: string = "";
    private hId?: string = "";
    constructor(from: string, to: string, id?: string) {
        this.from = from;
        this.to = to;
        this.id = id;
    }

    get type(): string { throw Error('type not defined') }

    get xml(): string { throw Error('xml not defined') }

    get from() { return this.hFrom; }

    set from(val: string) {
        this.hFrom = encode(val);
    }

    get to() { return this.hTo; }

    set to(val: string) {
        this.hTo = encode(val);
    }

    get id(): string|undefined { return this.hId || undefined; }

    set id(val: string|undefined) {
        if (!val) { return; }
        this.hId = encode(val);
    }

}

export class StzaPresence extends StzaBase {
    protected includeXContent: boolean = true;
    constructor(
        from: string,
        to?: string,
        id?: string,
        public presenceType?: string,
    ) {
        super(from, to, id);
    }

    get xContent(): string { return ""; }

    get xProtocol(): string { return "muc"; }

    get presenceContent(): string { return ""; }

    get type(): string {
        return "presence";
    }

    get xml(): string {
        const type = this.presenceType ? ` type='${this.presenceType}'` : "";
        const id = this.id ? ` id="${this.id}"` : "";
        const to = this.to ? ` to="${this.to}"` : "";
        let content = "";
        if (this.includeXContent) {
            content = this.xContent ? `<x xmlns='http://jabber.org/protocol/${this.xProtocol}'>${this.xContent}</x>` :
                "<x xmlns='http://jabber.org/protocol/muc'/>";
        }
        return `<presence from="${this.from}"${to}${id}${type}>${content}${this.presenceContent}</presence>`;
    }
}


export class StzaPresenceAvailable extends StzaPresence {
    constructor(from: string, to?: string, type?: string, private capsHash?: string, private status?: string) {
        super(from, to, uuid(), type);
        this.includeXContent = false;
    }
    get presenceContent() {
        const hash = this.capsHash ? `<c xmlns='http://jabber.org/protocol/caps' hash='sha-1' node='${NODE_NAME}' ver='${encode(this.capsHash)}'/>` : "";
        const status = this.status ? `<status>${he.encode(this.status)}</status>` : "";
        return hash+status;
    }
}

export class StzaPresenceSubscription extends StzaPresence {
    constructor(from: string, to: string, type: "subscribed"|"unsubscribed") {
        super(from, to, uuid(), type);
    }
}

export class StzaPresenceItem extends StzaPresence {
    public statusCodes: Set<XMPPStatusCode>;
    public actor?: string;
    public reason?: string;
    constructor(
        from: string,
        to: string,
        id?: string,
        public affiliation: PresenceAffiliation = PresenceAffiliation.Member,
        public role: PresenceRole = PresenceRole.Participant,
        self: boolean = false,
        public jid: string = "",
        itemType: string = "",
    ) {
        super(from, to, id, itemType);
        this.statusCodes = new Set();
        this.self = self;
    }

    set self(isSelf: boolean) {
        this.statusCodes[isSelf ? "add" : "delete"](XMPPStatusCode.SelfPresence);
    }

    get xProtocol(): string { return "muc#user"; }

    public get xContent() {
        const jid = this.jid ? ` jid='${this.jid}'` : "";
        let xml = [...this.statusCodes].map((s) => `<status code='${s}'/>`).join("");
        xml += `<item affiliation='${this.affiliation}'${jid} role='${this.role}'`;
        if (!this.actor && !this.reason) {
            return xml + "/>";
        }
        xml += ">";
        if (this.actor) {
            xml += `<actor nick='${encode(this.actor)}'/>`
        }
        if (this.reason) {
            xml += `<reason>${encode(this.reason)}</reason>`
        }
        xml += "</item>";
        return xml;
    }
}

export class StzaPresenceError extends StzaPresence {
    constructor(
        from: string,
        to: string,
        id: string,
        public by: string,
        public errType: string,
        public innerError: string,
        public text?: string,

    ) {
        super(from, to, id, "error");
    }

    public get presenceContent() {
        return `<error type='${this.errType}' by='${this.by}'><${this.innerError}`
             + " xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>"
             + (this.text ? `<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">${encode(this.text)}</text>` : "")
             + "</error>";
    }
}

export class StzaPresenceJoin extends StzaPresence {
    constructor(
        from: string,
        to: string,
        id?: string,
        public presenceType?: string,
    ) {
        super(from, to, id);
    }

    public get xContent() {
        // No history.
        // TODO: I'm sure we want to be able to configure this.
        return `<history maxchars='0'/>`;
    }
}

export class StzaPresencePart extends StzaPresence {
    constructor(
        from: string,
        to: string,
    ) {
        super(from, to, undefined, "unavailable");
        this.includeXContent = false;
        this.id = undefined;
    }
}

export class StzaPresenceKick extends StzaPresenceItem {
    constructor(
        from: string,
        to: string,
        reason?: string,
        actorNick?: string,
        self: boolean = false,
    ) {
        super(from, to, undefined, PresenceAffiliation.None, PresenceRole.None, self, undefined, "unavailable");
        this.actor = actorNick;
        this.reason = reason;
        this.statusCodes.add(XMPPStatusCode.SelfKicked);
    }
}
export class StzaMessage extends StzaBase {
    public html: string = "";
    public body?: string = "";
    public markable: boolean = true;
    public attachments: string[] = [];
    public replacesId?: string;
    public chatstate: "active"|"inactive"|"composing"|"paused"|undefined;
    constructor(
        from: string,
        to: string,
        idOrMsg?: string|IBasicProtocolMessage,
        public messageType?: string,
    ) {
        super(from, to, undefined);
        if (idOrMsg && idOrMsg.hasOwnProperty("body")) {
            idOrMsg = idOrMsg as IBasicProtocolMessage;
            this.body = idOrMsg.body;
            if (idOrMsg.formatted) {
                const html = idOrMsg.formatted.find((f) => f.type === "html");
                this.html = html ? html.body : "";
            }
            if (idOrMsg.opts) {
                // TODO: Support MXC urls in outbound messages?
                this.attachments = (idOrMsg.opts.attachments || []).filter(a => 'uri' in a).map(a => 'uri' in a && a.uri);
            }
            this.id = idOrMsg.id;
            if (idOrMsg.original_message) {
                this.replacesId = idOrMsg.original_message;
            }
        } else if (idOrMsg) {
            this.id = idOrMsg as string;
        }
        this.id = this.id || uuid();
    }

    get type(): string {
        return "message";
    }

    get xml(): string {
        const type = this.messageType ? `type='${this.messageType}'` : "";
        const attachments = this.attachments.map((a) =>
            `<x xmlns='jabber:x:oob'><url>${encode(a)}</url></x>`,
        );
        if (this.attachments.length === 1) {
            // For reasons unclear to me, XMPP reccomend we make the body == attachment url to make them show up inline.
            this.body = this.attachments[0];
        }
        // XEP-0333
        const markable = this.markable ? "<markable xmlns='urn:xmpp:chat-markers:0'/>" : "";
        // XEP-0308
        const replaces = this.replacesId ? `<replace id='${this.replacesId}' xmlns='urn:xmpp:message-correct:0'/>` : "";
        // XEP-0085
        const chatstate = this.chatstate ? `<${this.chatstate} xmlns='http://jabber.org/protocol/chatstates'/>` : "";
        const body = this.body ? `<body>${encode(this.body)}</body>` : "";
        return `<message from="${this.from}" to="${this.to}" id="${this.id}" ${type}>`
             + `${this.html}${body}${attachments}${markable}${replaces}${chatstate}</message>`;
    }
}

export class StzaMessageSubject extends StzaBase {
    constructor(
        from: string,
        to: string,
        id?: string,
        public subject: string = "",
    ) {
        super(from, to, id);
    }

    get content(): string { return ""; }

    get type(): string {
        return "message";
    }

    get xml(): string {
        return `<message from="${this.from}" to="${this.to}" id="${this.id}" type='groupchat'>`
             + `<subject>${encode(this.subject)}</subject></message>`;
    }
}

export class StzaIqResponse extends StzaBase {
    protected extraContent: string = "";
    constructor(
        from: string,
        to: string,
        id: string,
        public responseType: string,
    ) {
        super(from, to, id || uuid());
    }

    get type() {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='${this.responseType}'/>`;
    }
}

export class StzaJingleAcceptIBB extends StzaBase {
    protected extraContent: string = "";
    public responder: string;
    public initiator: string;
    constructor(
        from: string,
        to: string,
        public sid: string,
        public contentName: string,
        public descriptionXML: string,
        public transportBSize: number,
        public transportSid: string,
        responder?: string,
        initiator?: string,
    ) {
        super(from, to, uuid());
        this.responder = responder || this.from;
        this.initiator = initiator || this.to;
    }

    get type() {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='set'>` +
        `<jingle xmlns='${XMPPFeatures.Jingle}' action='session-accept' initiator='${this.initiator}' responder='${this.responder}' sid='${this.sid}'>`
        + `<content creator='initator' name='${this.contentName}'>`
        + this.descriptionXML
        + `<transport xmlns='${XMPPFeatures.JingleIBB}' block-size='${this.transportBSize}' sid='${this.transportSid}'/>`
        + '</content></jingle></iq>'
    }
}

export class StzaJingleIBBClose extends StzaBase {
    constructor(
        from: string,
        to: string,
        public sid: string,
    ) {
        super(from, to, uuid());
    }

    get type() {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='set'>` +
        `<close xmlns='http://jabber.org/protocol/ibb' sid='${this.sid}'/></iq>`
    }
}

export class StzaJingleTerminate extends StzaBase {
    public responder?: string;
    public initiator?: string;
    constructor(
        from: string,
        to: string,
        public sid: string,
        responder?: string,
        initiator?: string,
        public reason?: "success"|"failed-application",
    ) {
        super(from, to, uuid());
        this.responder = responder || this.from;
        this.initiator = initiator || this.to;
    }

    get type() {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='set'>` +
        `<jingle initiator='${this.initiator}' responder='${this.responder}' xmlns='urn:xmpp:jingle:1' action='session-terminate' sid='${this.sid}'><reason><${this.reason}/></reason></jingle></iq>`
    }
}

export class StzaIqPing extends StzaBase {
    protected extraContent: string = "";
    constructor(
        from: string,
        to: string,
        id: string,
        public responseType: string,
    ) {
        super(from, to, id || uuid());
    }

    get type(): string {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='${this.responseType}'>`
               + `<ping xmlns='urn:xmpp:ping'/>${this.extraContent}</iq>`;
    }
}

export class StzaIqPingError extends StzaIqPing {
    constructor(
        from: string,
        to: string,
        id: string,
        private eType: "service-unavailable"|"not-acceptable",
        private by?: string,
    ) {
        super(from, to, id, "error");
        this.extraContent = `<error type='cancel'${this.by ? ` by='${this.by}'` : ""}>`
        + `<${this.eType} xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/></error>`;
    }
}

export abstract class StzaIqDisco extends StzaBase {
    constructor(
        from: string,
        to: string,
        id: string,
        protected iqType = "result",
        protected queryType = "",
        public node?: string,
    ) {
        super(from, to, id);
    }

    get type(): string {
        return "iq";
    }

    get queryContent(): string { return ""; }

    get xml(): string {
        const node = this.node ? ` node='${this.node}'` : "";
        return `<iq${node} from='${this.from}' to='${this.to}' id='${this.id}' type='${this.iqType}'>`
         + `<query xmlns='${this.queryType}'>${this.queryContent}</query></iq>`;
    }
}

export class StzaIqDiscoItems extends StzaIqDisco {
    private items: {jid: string, name: string}[];
    constructor(
        from: string,
        to: string,
        id: string,
        queryType: string,
    ) {
        super(from, to, id, "result", queryType);
        this.items = [];
    }

    get queryContent(): string {
        const items = this.items.map((item) =>
            `<item jid='${encode(item.jid)}' name='${encode(item.name)}'/>`,
        ).join("");
        return items;
    }

    public addItem(jid: string, name: string) {
        this.items.push({jid, name});
    }
}

export class StzaIqDiscoInfo extends StzaIqDisco {
    public identity: Set<{category: string, type: string, name: string}>;
    public feature: Set<XMPPFeatures>;

    constructor(
        from: string,
        to: string,
        id: string,
        iqType = "result") {
        super(from, to, id, iqType, "http://jabber.org/protocol/disco#info");
        this.identity = new Set();
        this.feature = new Set();
    }

    get queryContent(): string {
        let identity = "";
        let feature = "";
        this.identity.forEach((ident) => {
            identity += `<identity category='${ident.category}' type='${ident.type}' name='${ident.name}'/>`;
        });
        this.feature.forEach((feat) => {
            feature += `<feature var='${feat}'/>`;
        });
        return identity + feature;
    }

    get hash() {
        // https://xmpp.org/extensions/xep-0115.html#ver-gen
        let s = '';
        s += [...this.identity].sort((identA, identB) => {
            const a = identA.category.localeCompare(identB.category);
            if (a !== 0 ) {
                return a;
            }
            return identA.type.localeCompare(identB.type);
            // Extra slash for the non-existent xml:lang property
        }).map(ident => `${ident.category}/${ident.type}//${ident.name}`).join('<') + '<';
        s += [...this.feature].sort().join('<') + '<';
        const shasum = createHash('sha1').update(s).digest('base64');
        return shasum;
    }

}

export class StzaIqSearchFields extends StzaBase {
    constructor(
        from: string,
        to: string,
        id: string,
        public instructions: string,
        public fields: {[key: string]: string},
    ) {
        super(from, to, id);
    }

    get type(): string {
        return "iq";
    }

    get queryContent(): string { return ""; }

    get xml(): string {
        const fields = Object.keys(this.fields).map((field) => `<${field}>${this.fields[field]}</${field}>`).join("");
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='result' xml:lang='en'>`
        + `<query xmlns='jabber:iq:search'><instructions>${encode(this.instructions)}</instructions>`
        + `${fields}</query></iq>`;
    }
}

export class SztaIqError extends StzaBase {
    constructor(
        from: string,
        to: string,
        id: string,
        private errorType: string,
        private errorCode: number|null,
        private innerError: string,
        private by?: string,
        private text?: string,
    ) {
        super(from, to, id);
    }

    get type(): string {
        return "iq";
    }

    get xml(): string {
        let errorParams = "";
        if (this.errorCode) {
            errorParams += ` code='${this.errorCode}'`;
        }
        if (this.by) {
            errorParams += ` by='${this.by}'`;
        }
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='error' xml:lang='en'>`
        + `<error type='${this.errorType}'${errorParams}><${this.innerError} ` +
          "xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>" +
          (this.text ? `<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">${encode(this.text)}</text>` : "") +
          "</error></iq>";
    }
}

export class StzaIqVcardRequest extends StzaBase {

    constructor(from: string, to: string, id) {
        super(from, to, id);
    }

    get type(): string {
        return "iq";
    }

    get xml(): string {
        return `<iq from='${this.from}' to='${this.to}' id='${this.id}' type='get'>` +
            "<vCard xmlns='vcard-temp'/>" +
        "</iq>";
    }
}
