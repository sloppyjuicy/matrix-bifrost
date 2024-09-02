import { IConfigPortals } from "./Config";
import { BifrostProtocol } from "./bifrost/Protocol";
import { IChatJoinProperties } from "./bifrost/Events";
import { IBifrostInstance } from "./bifrost/Instance";
import { Logger } from "matrix-appservice-bridge";
const log = new Logger("RoomAliasSet");

export interface IRoomAlias {
    protocol: string;
    properties: {[key: string]: string};
}

export interface IAliasResult {
    protocol: BifrostProtocol;
    properties: IChatJoinProperties;
}

export class RoomAliasSet {
    private aliases: Map<RegExp, IRoomAlias>;

    constructor(config: IConfigPortals, private purple: IBifrostInstance) {
        config.aliases = config.aliases || {};
        this.aliases = new Map();
        Object.keys(config.aliases).forEach((regex) => {
            this.aliases.set(new RegExp(regex), config.aliases![regex]);
        });
        log.info(`Loaded ${this.aliases.size} regexes`);
    }

    public getOptsForAlias(alias: string): IAliasResult | undefined  {
        log.info("Checking alias", alias);
        for (const regex of this.aliases.keys()) {
            const match = regex.exec(alias);
            if (!match) {
                log.debug(`No match for ${alias} against ${regex}`);
                continue;
            }
            const opts = this.aliases.get(regex)!;
            const protocol = this.purple.getProtocol(opts.protocol)!;
            if (!protocol) {
                log.warn(`${alias} matched ${opts.protocol} but no protocol is available`);
                return;
            }
            const properties = Object.assign({}, opts.properties);
            Object.keys(properties).forEach((key) => {
                const split = properties[key].split("regex:");
                if (split.length === 2) {
                    properties[key] = match[parseInt(split[1])];
                }
            });
            return {protocol, properties};
        }
    }
}
