import e from "express";
import path from "node:path";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { decode, encode } from "msgpack-lite";
import { Game } from "./moomoo/server.js";
import { Player } from "./moomoo/modules/player.js";
import { items } from "./moomoo/modules/items.js";
import { UTILS } from "./moomoo/libs/utils.js";
import { hats, accessories } from "./moomoo/modules/store.js";
import { delay } from "./moomoo/modules/delay.js";
import { filter_chat } from "./moomoo/libs/filterchat.js";
import { config } from "./moomoo/config.js";
import { ConnectionLimit } from "./moomoo/libs/limit.js";

const colimit = new ConnectionLimit(4);

const app = e();
const server = createServer(app);
const wss = new WebSocketServer({
    server
});

const INDEX = path.join(import.meta.dirname, "../client/index.html");
const PORT = 8080;

app.get("/", (req, res) => {
    res.sendFile(INDEX);
});

app.get("/ping", (_req, res) => {
    res.send("Ok");
});

app.use(e.static("../client/public"));

const game = new Game;

wss.on("connection", (socket, req) => {

    const addr = req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress;

    if (
        colimit.check(addr)
    ) {
        return void socket.close(4001);
    }

    colimit.up(addr);

    /**
     * @type {Player | null}
     */
    let player = null;

    const emit = async (type, ...data) => {
        await delay();
        socket.send(encode([type, data]));
    };

    socket.on("message", async msg => {

        try {

            const [
                type,
                data
            ] = decode(new Uint8Array(msg));

            const t = type?.toString();

            await delay();

            switch(t) {
                case "sp": {

                    (() => {

                        if (player && player.alive) {
                            return;
                        }
    
                        if (!player) {
                            player = game.addPlayer(socket);
                        }

                        player.setUserData(data[0]);
                        player.spawn(data[0]?.moofoll);
                        player.send("1", player.sid);

                    })();

                    break;
                }
                case "33": {

                    if (!player || !player.alive) {
                        break;
                    }

                    if (!(data[0] === undefined || data[0] === null) && !UTILS.isNumber(data[0])) break;

                    player.moveDir = data[0];
                    break;

                }
                case "c": {

                    if (!player || !player.alive) {
                        break;
                    }

                    player.mouseState = data[0];
                    if (data[0] && player.buildIndex === -1) {
                        player.hits++;
                    }
    
                    if (UTILS.isNumber(data[1])) {
                        player.dir = data[1];
                    }
    
                    if (player.buildIndex >= 0) {
                        const item = items.list[player.buildIndex];
                        if (data[0]) player.buildItem(item);
                        player.mouseState = 0;
                        player.hits = 0;
                    }
                    break;

                }
                case "7": {
                    if (!player || !player.alive) {
                        break;
                    }

                    if (data[0]) {
                        player.autoGather = !player.autoGather;
                    }
                    break;

                }
                case "2": {

                    if (!player || !player.alive) {
                        break;
                    }

                    if (!UTILS.isNumber(data[0])) break;

                    player.dir = data[0];
                    break;

                }
                case "5": {

                    if (!player || !player.alive) {
                        break;
                    }

                    if (!UTILS.isNumber(data[0])) {
                        break;
                    }

                    if (data[1]) {

                        const wpn = items.weapons[data[0]];

                        if (!wpn) {
                            break;
                        }

                        if (player.weapons[wpn.type] !== data[0]) {
                            break;
                        }

                        player.buildIndex = -1;
                        player.weaponIndex = data[0];
                        break;
                    }

                    const item = items.list[data[0]];

                    if (!item) {
                        break;
                    }

                    if (player.buildIndex === data[0]) {
                        player.buildIndex = -1;
                        player.mouseState = 0;
                        break;
                    }

                    player.buildIndex = data[0];
                    player.mouseState = 0;
                    break;

                }
                case "13c": {

                    if (!player || !player.alive) {
                        break;
                    }

                    const [type, id, index] = data;

                    if (index) {
                        let tail = accessories.find(acc => acc.id == id);
            
                        if (tail) {
                            if (type) {
                                if (!player.tails[id] && player.points >= tail.price) {
                                    player.tails[id] = 1;
                                    emit("us", 0, id, 1);
                                }
                            } else {
                                if (player.tails[id]) {
                                    player.tail = tail;
                                    player.tailIndex = player.tail.id;
                                    emit("us", 1, id, 1);
                                }
                            }
                        } else {
                            if (id == 0) {
                                player.tail = null;
                                player.tailIndex = 0;
                                emit("us", 1, 0, 1);
                            }
                        }
                    } else {
                        let hat = hats.find(hat => hat.id == id);
            
                        if (hat) {
                            if (type) {
                                if (!player.skins[id] && player.points >= hat.price) {
                                    player.skins[id] = 1;
                                    emit("us", 0, id, 0);
                                }
                            } else {
                                if (player.skins[id]) {
                                    player.skin = hat;
                                    player.skinIndex = player.skin.id;
                                    emit("us", 1, id, 0);
                                }
                            }
                        } else {
                            if (id == 0) {
                                player.skin = null;
                                player.skinIndex = 0;
                                emit("us", 1, 0, 0);
                            }
                        }
                    }

                    break;

                }
                case "6": {

                    if (!player || !player.alive) {
                        break;
                    }

                    if (player.upgradePoints <= 0) break;

                    const item = Number.parseInt(data[0]);

                    const upgr_items = items.list.filter(x => x.age === player.upgrAge);
                    const upgr_weapons = items.weapons.filter(x => x.age === player.upgrAge);

                    const update = (() => {

                        if (item < items.weapons.length) {

                            const wpn = upgr_weapons.find(x => x.id === item);

                            if (!wpn) return false;

                            player.weapons[wpn.type] = wpn.id;
                            player.weaponXP[wpn.type] = 0;

                            const type = player.weaponIndex < 9 ? 0 : 1;

                            if (wpn.type === type) {
                                player.weaponIndex = wpn.id;
                            }

                            return true;

                        }

                        const i2 = item - items.weapons.length;

                        if (!upgr_items.some(x => x.id === i2)) return false;

                        player.addItem(i2);

                        return true;
                        
                    })();

                    if (!update) break;

                    player.upgrAge++;
                    player.upgradePoints--;

                    player.send("17", player.items, 0);
                    player.send("17", player.weapons, 1);

                    if (player.age >= 0) {
                        player.send("16", player.upgradePoints, player.upgrAge);
                    } else {
                        player.send("16", 0, 0);
                    }

                    break;
                }
                case "ch": {

                    if (!player || !player.alive) {
                        break;
                    }

                    if (player.chat_cooldown > 0) {
                        break;
                    }

                    if (typeof data[0] !== "string") {
                        break;
                    }

                    const chat = filter_chat(data[0]);

                    if (chat.length === 0) {
                        break;
                    }

                    game.server.broadcast("ch", player.sid, chat);
                    player.chat_cooldown = 300;

                    break;
                }
                case "pp": {
                    emit("pp");
                    break;
                }
                case "8": {

                    if (!player || !player.alive) break;

                    if (player.team) break;

                    if (player.clan_cooldown > 0) break;

                    if (typeof data[0] !== "string") break;

                    if (data[0].length < 1 || data[0].length > 7) break;

                    const created = game.clan_manager.create(data[0], player);

                    if (!created) break;

                    player.clan_cooldown = 200;
                    player.is_owner = true;

                    break;
                }
                case "9": {

                    if (!player || !player.alive) break;

                    if (!player.team) break;

                    if (player.clan_cooldown > 0) break;

                    player.clan_cooldown = 200;

                    if (player.is_owner) {
                        game.clan_manager.remove(player.team);
                        break;
                    }
                    
                    game.clan_manager.kick(player.team, player.sid);
                    break;

                }
                case "10": {

                    if (!player || !player.alive) break;

                    if (player.team) break;

                    if (player.clan_cooldown > 0) break;

                    player.clan_cooldown = 200;

                    game.clan_manager.add_notify(data[0], player.sid);
                    break;

                }
                case "11": {

                    if (!player || !player.alive) break;

                    if (!player.team) break;

                    if (player.clan_cooldown > 0) break;

                    player.clan_cooldown = 200;

                    game.clan_manager.confirm_join(player.team, data[0], data[1]);
                    player.notify.delete(data[0]);
                    break;

                }
                case "14": {

                    if (!player || !player.alive) break;

                    if (player.ping_cooldown > 0) break;

                    player.ping_cooldown = config.mapPingTime;

                    game.server.broadcast("p", player.x, player.y);

                    break;
                }
                case "rmd": {

                    if (!player || !player.alive) break;

                    player.resetMoveDir();

                    break;
                }
                default:
                    break;
            }

        } catch(e) {

            console.error(e);

            socket.close();

        }

    });

    socket.on("close", reason => {

        colimit.down(addr);

        if (!player) return;

        if (player.team) {

            if (player.is_owner) {
                game.clan_manager.remove(player.team);
            } else {
                game.clan_manager.kick(player.team, player.sid);
            }

        }

        game.removePlayer(player?.id);

    });

});

server.listen(PORT, (error) => {

    if (error) {
        throw error;
    }

    console.log(`go http://127.0.0.1:${PORT}`);

});