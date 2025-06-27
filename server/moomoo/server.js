
import { Player } from "./modules/player.js";
import { AI } from "./modules/ai.js";
import { UTILS } from "./libs/utils.js";
import { config } from "./config.js";
import { ProjectileManager } from "./modules/projectileManager.js";
import { Projectile } from "./modules/projectile.js";
import { ObjectManager } from "./modules/objectManager.js";
import { GameObject } from "./modules/gameObject.js";
import { items } from "./modules/items.js";
import { AiManager } from "./modules/aiManager.js";
import { accessories, hats } from "./modules/store.js";

import NanoTimer from "nanotimer";
import { encode } from "msgpack-lite";
import { delay } from "./modules/delay.js";

export class Game {

    // var
    players = [];
    ais = [];
    projectiles = [];
    game_objects = [];

    server = {
        broadcast: async (type, ...data) => {
            await delay();
            for (const player of this.players) {
                player.socket.send(encode([
                    type,
                    data
                ]))
            }

        }
    };

    // managers
    ai_manager = new AiManager(this.ais, AI, this.players, items, this.object_manager, config, UTILS, () => {}, this.server);
    object_manager = new ObjectManager(GameObject, this.game_objects, UTILS, config, this.players, this.server);
    projectile_manager = new ProjectileManager(Projectile, this.projectiles, this.players, this.ais, this.object_manager, items, config, UTILS, this.server);

    id_storage = new Array(config.maxPlayersHard).fill(true);

    constructor() {

        const nano = (1000 / config.serverUpdateRate);
        const timer = new NanoTimer;

        let last = 0;

        setInterval(() => {

            const t = performance.now();

            const delta = t - last;
            last = t;

            let kills = 0;
            let leader = null;

            for (const player of this.players) {

                player.update(delta);
                player.iconIndex = 0;

                if (kills < player.kills) {
                    kills = player.kills;
                    leader = player;
                }

            }

            if (leader) leader.iconIndex = 1;

            for (const projectile of this.projectiles)
                projectile.update(delta);

            for (const object of this.game_objects) 
                object.update(delta);

            for (const player of this.players) {

                const sent_players = [];
                const sent_objects = [];
            
                for (const player2 of this.players) {

                    if (!player.canSee(player2) || !player2.alive) {
                        continue;
                    }

                    if (!player2.sentTo[player.id]) {
                        player2.sentTo[player.id] = true;
                        player.send("2", player2.getData(), player.id === player2.id);
                    }
                    sent_players.push(player2.getInfo());

                }

                for (const object of this.game_objects) {

                    if (
                        !object.sentTo[player.id] && object.active && object.visibleToPlayer(player) && player.canSee(object)
                    ) {
                        sent_objects.push(object);
                        object.sentTo[player.id] = true;
                    }

                }

                player.send("33", sent_players.flatMap(data => data));
        
                if (sent_objects.length > 0) {
                    player.send("6", sent_objects.map(object => [object.sid, UTILS.fixTo(object.x, 1), UTILS.fixTo(object.y, 1), object.dir, object.scale, object.type, object.id, object.owner ? object.owner.sid : -1]).flatMap(x => x));
                }

            }

        }, nano);

    }

    addPlayer(socket) {

        const string_id = UTILS.randomString(16);
        const sid = this.id_storage.findIndex(bool => bool);
        const player = new Player(
            string_id,
            sid,
            config,
            UTILS,
            this.projectile_manager,
            this.object_manager,
            this.players,
            this.ais,
            items,
            hats,
            accessories,
            socket,
            () => {},
            () => {}
        );

        player.send("io-init", player.id);
        player.send("id", {
            teams: []
        });

        this.id_storage[sid] = false;
        this.players.push(player);

        return player;

    }

    removePlayer(id) {

        for (let i = 0; i < this.players.length; i++) {

            const player = this.players[i];

            if (player.id === id) {
                this.server.broadcast("4", player.id);
                this.players.splice(i, 1);
                this.id_storage[player.sid] = true;
                break;
            }

        }

    }

}