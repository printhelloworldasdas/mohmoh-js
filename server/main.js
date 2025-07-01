require("dotenv").config()
const WebSocket = require("ws")
const msgpack = require("msgpack-lite")
const http = require("http")
const url = require("url")
const inquirer = require("inquirer")
const fetch = require("node-fetch")
const package = require("./package.json")
const express = require("express") // Añadido express

const app = express() // Creamos la app express

// Configuramos el middleware para servir archivos estáticos
app.use(express.static("../client/public"))

async function checkLatest() {
	const response = await fetch("https://raw.githubusercontent.com/kookywarrior/moomooio-private-server/main/package.json")
	const data = await response.json()
	return data.version === package.version
}

var MODE = process.env.MODE
var PASSWORD = process.env.PASSWORD
var PREFIX = process.env.PREFIX
const PORT = process.env.PORT || 1234
var server = new WebSocket.Server({ noServer: true })

let delta,
	now,
	lastUpdate = Date.now()
var ais = []
var players = []
var gameObjects = []
var projectiles = []
function findPlayerByID(id) {
	for (let i = 0; i < players.length; ++i) {
		if (players[i].id === id) {
			return players[i]
		}
	}
	return null
}
function findPlayerBySID(sid) {
	for (let i = 0; i < players.length; ++i) {
		if (players[i].sid === sid) {
			return players[i]
		}
	}
	return null
}
const UTILS = require("./src/utils")
let config = require("./src/config")
let GameObject = require("./src/gameObject.js")
let items = require("./src/items.js")
let ObjectManager = require("./src/objectManager.js")
let Player = require("./src/player.js")
let store = require("./src/store.js")
let Projectile = require("./src/projectile.js")
let ProjectileManager = require("./src/projectileManager.js")
let AiManager = require("./src/aiManager.js")
let AI = require("./src/ai.js")
let TribeManager = require("./src/tribeManager.js")
let Tribe = require("./src/tribe.js")
let objectManager = new ObjectManager(GameObject, gameObjects, UTILS, config, players, server)
let aiManager = new AiManager(ais, AI, players, items, objectManager, config, UTILS, scoreCallback, server)
let projectileManager = new ProjectileManager(Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server)
let tribeManager = new TribeManager(Tribe, findPlayerBySID, server)
let hats = store.hats,
	accessories = store.accessories

var connection = {}
server.send = function (id, type, data = []) {
	if (connection[id]) {
		connection[id].send(new Uint8Array(Array.from(msgpack.encode([UTILS.OldToNew(type, "RECEIVE"), data]))))
	}
}
server.sendAll = function (type, data = []) {
	for (let i = 0; i < players.length; i++) {
		let tmpPlayer = players[i]
		if (tmpPlayer) {
			server.send(tmpPlayer.id, type, data)
		}
	}
}

let playersSid = []
server.addListener("connection", function (conn) {
	while (true) {
		conn.id = UTILS.randomString(10)
		let returnvalue = true
		for (let i = 0; i < players.length; i++) {
			if (conn.id === players[i].id) {
				returnvalue = false
				break
			}
		}
		if (returnvalue) break
	}

	conn.sid = 1
	while (true) {
		if (!playersSid.includes(conn.sid)) {
			playersSid.push(conn.sid)
			break
		}
		conn.sid++
	}

	connection[conn.id] = conn
	conn.on("error", console.log)
	conn.on("close", function () {
		let tmpPlayer = findPlayerByID(conn.id)
		if (!tmpPlayer) return
		if (tmpPlayer.team && MODE !== "HOCKEY") {
			if (tmpPlayer.isLeader) {
				server.sendAll("ad", [tmpPlayer.team])
				tribeManager.deleteTribe(tmpPlayer.team)
			} else {
				tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpPlayer)
			}
		}
		server.sendAll("4", [conn.id])
		objectManager.removeAllItems(tmpPlayer.sid, server)
		for (let i = 0; i < players.length; ++i) {
			if (players[i].id == conn.id) {
				players.splice(i, 1)
				const tmpIndex = playersSid.indexOf(conn.sid)
				if (tmpIndex !== -1) {
					playersSid.splice(tmpIndex, 1)
				}
				updateLeaderboard()
				iconCallback()
				break
			}
		}
	})

	conn.on("message", function (message) {
		let data,
			parsed,
			type,
			error = false
		try {
			data = new Uint8Array(message)
			parsed = msgpack.decode(data)
			type = UTILS.NewToOld(parsed[0], "SEND")
			data = parsed[1]
		} catch (e) {
			error = true
			conn.close()
		}
		if (error) return
		const events = {
			pp: pingSocket,
			sp: enterGame,
			rmd: resetMoveDir,
			c: sendAtckState,
			33: sendMoveDir,
			2: sendDir,
			5: selectToBuild,
			6: sendUpgrade,
			7: sendLockGather,
			ch: sendMessage,
			"13c": storeFunction,
			8: createAllaince,
			9: leaveAlliance,
			10: sendJoinRequest,
			11: decideJoinRequest,
			12: kickFromClan,
			14: sendMapPing
		}
		if (events[type]) {
			try {
				events[type].apply(undefined, data)
			} catch (error) {}
		}

		function pingSocket() {
			server.send(conn.id, "pp")
		}

		function enterGame(data) {
			if (MODE === "HOCKEY" && config.isStarted) return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer) {
				tmpPlayer.spawn(data.moofoll)
				tmpPlayer.visible = false
				const location = objectManager.fetchSpawnObj(tmpPlayer.sid) || [UTILS.randInt(0, config.mapScale), UTILS.randInt(0, config.mapScale)]
				tmpPlayer.setData([tmpPlayer.id, tmpPlayer.sid, data.name, location[0], location[1], 0, 100, 100, config.playerScale, data.skin])
				server.send(conn.id, "1", [tmpPlayer.sid])
				updateLeaderboard()
			}
		}

		function resetMoveDir() {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				tmpPlayer.resetMoveDir()
			}
		}

		function sendAtckState(mouseState, dir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (dir) {
					tmpPlayer.dir = dir
				}
				tmpPlayer.mouseState = mouseState
				if (mouseState) {
					if (tmpPlayer.buildIndex >= 0) {
						for (let i = 0; i < items.list.length; i++) {
							if (i === tmpPlayer.buildIndex) {
								tmpPlayer.buildItem(items.list[i])
								break
							}
						}
					} else {
						tmpPlayer.gathering = mouseState
					}
				}
			}
		}

		function sendMoveDir(newMoveDir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				tmpPlayer.moveDir = newMoveDir
			}
		}

		function sendDir(newDir) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				tmpPlayer.dir = newDir
			}
		}

		function selectToBuild(index, wpn) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (wpn) {
					tmpPlayer.buildIndex = -1
					tmpPlayer.weaponIndex = index
				} else {
					var canbuild = true
					for (let i = 0; i < items.list.length; i++) {
						if (i === index) {
							canbuild = tmpPlayer.canBuild(items.list[i])
							break
						}
					}
					if (!canbuild || tmpPlayer.buildIndex === index) {
						tmpPlayer.buildIndex = -1
					} else {
						tmpPlayer.buildIndex = index
					}
				}
			}
		}

		function sendLockGather(type) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (type === 0) {
					tmpPlayer.lockDir = tmpPlayer.lockDir ? 0 : 1
				} else if (type === 1) {
					tmpPlayer.autoGather = tmpPlayer.autoGather ? 0 : 1
				}
			}
		}

		function sendMessage(message) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (!tmpPlayer || !tmpPlayer.alive) return
			if (message === `${PREFIX}login ${PASSWORD}` && !tmpPlayer.admin) {
				tmpPlayer.admin = true
				return
			}
			if (message.startsWith(PREFIX) && tmpPlayer.admin) {
				if (message === `${PREFIX}setup`) {
					for (let i = 0; i < 9; i++) {
						tmpPlayer.addResource(3, 999999, true)
					}
					tmpPlayer.addResource(2, 999999, true)
					tmpPlayer.addResource(1, 999999, true)
					tmpPlayer.addResource(0, 999999, true)
				} else if (message.startsWith(`${PREFIX}speed`)) {
					var speedmlt = message.replace(PREFIX + "speed ", "")
					if (UTILS.isNumber(parseFloat(speedmlt))) {
						tmpPlayer.speed = parseFloat(speedmlt)
					}
				} else if (message.startsWith(`${PREFIX}tp`)) {
					var tmpArgs = message.replace(PREFIX + "tp ", "").split(" ")
					if (tmpArgs[1] == null) {
						var tmpObj = findPlayerBySID(parseInt(tmpArgs[0]))
						if (tmpObj) {
							tmpPlayer.x = tmpObj.x
							tmpPlayer.y = tmpObj.y
						}
					} else {
						const tmpX = parseInt(tmpArgs[0])
						const tmpY = parseInt(tmpArgs[1])
						if (UTILS.isNumber(tmpX) && UTILS.isNumber(tmpY)) {
							tmpPlayer.x = tmpX
							tmpPlayer.y = tmpY
						}
					}
				} else if (message.startsWith(`${PREFIX}v`)) {
					var msg = message.replace(PREFIX + "v ", "")
					switch (msg) {
						case "ruby":
							tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 12000
							break
						case "diamond":
							tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 7000
							break
						case "gold":
							tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 3000
							break
						case "normal":
							tmpPlayer.weaponXP[tmpPlayer.weaponIndex] = 0
							break
					}
				} else if (message === PREFIX + "die") {
					tmpPlayer.kill(tmpPlayer)
				} else if (message.startsWith(`${PREFIX}upgrade`)) {
					var msg = message.replace(PREFIX + "upgrade ", "")
					sendUpgrade(parseInt(msg))
				} else if (message.startsWith(PREFIX + "dmg")) {
					if (message === PREFIX + "dmg") {
						tmpPlayer.customDmg = null
					} else {
						var dmg = message.replace(PREFIX + "dmg ", "")
						if (UTILS.isNumber(parseFloat(dmg))) {
							tmpPlayer.customDmg = parseFloat(dmg)
						}
					}
				} else if (message === PREFIX + "breakall") {
					objectManager.removeAllItems(tmpPlayer.sid, server)
					for (let i = 0; i < items.groups.length; i++) {
						tmpPlayer.changeItemAllCount(i, 0)
					}
				} else if (MODE === "HOCKEY" && message === PREFIX + "start" && !config.isStarted) {
					var tmpObj = findPlayerBySID(1)
					if (tmpObj) {
						tmpObj.spawn(false)
						tmpObj.visible = false
						tmpObj.setData([
							tmpObj.id,
							tmpObj.sid,
							" ",
							(3000 + 43 + (40 - 2) * 43 * 2 + (3000 + 43)) / 2,
							(3000 + 43 + (20 - 2) * 43 * 2 + (3000 + 43)) / 2,
							Math.PI / 2,
							0,
							100,
							config.playerScale,
							4
						])
						tmpObj.weaponIndex = 11
						const teams = UTILS.randTeam(players.slice(1), (players.length - 1) / 2)
						Array.from(teams[0]).forEach((tmpppl) => {
							if (tmpppl) {
								tmpppl.team = "Team 1"
								tmpppl.x = 3000 + 43
								tmpppl.y = UTILS.randFloat(3000 + 43, 3000 + 43 + (20 - 2) * 43 * 2)
							}
						})
						if (teams[1]) {
							Array.from(teams[1]).forEach((tmpppl) => {
								if (tmpppl) {
									tmpppl.team = "Team 2"
									tmpppl.x = 3000 + 43 + (40 - 2) * 43 * 2
									tmpppl.y = UTILS.randFloat(3000 + 43, 3000 + 43 + (20 - 2) * 43 * 2)
								}
							})
						}
						config.isStarted = true
					}
				}
			} else {
				server.sendAll("ch", [tmpPlayer.sid, message.toString()])
			}
		}

		function sendUpgrade(index) {
			if (index < 0 || index > items.weapons.length + items.list.length) return

			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (items.weapons[index]) {
					if (tmpPlayer.weaponIndex < 9 && index < 9) {
						tmpPlayer.weaponIndex = index
					} else if (!(tmpPlayer.weaponIndex < 9) && !(index < 9)) {
						tmpPlayer.weaponIndex = index
					}
					tmpPlayer.weapons[index < 9 ? 0 : 1] = index
					server.send(conn.id, "17", [tmpPlayer.weapons, 1])
				} else {
					index -= 16
					if (tmpPlayer.buildIndex !== -1 && items.list[index].group.id === items.list[tmpPlayer.buildIndex].group.id) {
						tmpPlayer.buildIndex = index
					}

					let addedItem = false
					for (let i = 0; i < tmpPlayer.items.length; i++) {
						if (items.list[tmpPlayer.items[i]].group.id === items.list[index].group.id) {
							tmpPlayer.items[i] = index
							addedItem = true
							break
						}
					}
					if (!addedItem) {
						tmpPlayer.items.push(index)
					}
					server.send(conn.id, "17", [tmpPlayer.items])
				}
				tmpPlayer.upgrAge++
				tmpPlayer.upgradePoints--
				server.send(conn.id, "16", [tmpPlayer.upgradePoints, tmpPlayer.upgrAge])
			}
		}

		function storeFunction(type, id, index) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				var tmpObj = null
				if (id !== 0) {
					if (index) {
						for (let i = 0; i < accessories.length; ++i) {
							if (accessories[i].id === id) {
								tmpObj = accessories[i]
								break
							}
						}
					} else {
						for (let i = 0; i < hats.length; i++) {
							if (hats[i].id === id) {
								tmpObj = hats[i]
								break
							}
						}
					}
				}

				if (index) {
					if (type) {
						if (tmpObj.price <= tmpPlayer.points) {
							tmpPlayer.addResource(3, -tmpObj.price)
							server.send(conn.id, "us", [0, id, index])
						}
					} else {
						tmpPlayer.tail = tmpObj
						tmpPlayer.tailIndex = id
						server.send(conn.id, "us", [1, id, index])
					}
				} else {
					if (type) {
						if (tmpObj.price <= tmpPlayer.points) {
							tmpPlayer.addResource(3, -tmpObj.price)
							server.send(conn.id, "us", [0, id, index])
						}
					} else {
						tmpPlayer.skin = tmpObj
						tmpPlayer.skinIndex = id
						server.send(conn.id, "us", [1, id, index])
					}
				}
			}
		}

		function createAllaince(name) {
			if (MODE === "HOCKEY") return
			if (typeof name !== "string" || name.length <= 0) return

			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (tribeManager.getTribe(name) == null) {
					const tmpClan = tribeManager.createTribe(name, tmpPlayer)
					server.sendAll("ac", [tmpClan.getData()])
					server.send(conn.id, "st", [name, 1])
				}
			}
		}

		function leaveAlliance() {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				if (tmpPlayer.isLeader) {
					server.sendAll("ad", [tmpPlayer.team])
					tribeManager.deleteTribe(tmpPlayer.team)
				} else {
					tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpPlayer)
					server.send(conn.id, "st", [null, 0])
				}
			}
		}

		function kickFromClan(sid) {
			if (MODE === "HOCKEY") return
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive && tmpPlayer.isLeader) {
				const tmpObj = findPlayerBySID(sid)
				if (tmpObj) {
					tribeManager.getTribe(tmpPlayer.team).removePlayer(tmpObj)
					server.send(tmpObj.id, "st", [null, 0])
				}
			}
		}

		function sendJoinRequest(sid) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive) {
				const tmpClan = tribeManager.getTribe(sid)
				if (tmpClan) {
					let isRequestSent = false
					for (let i = 0; i < tmpClan.joinQueue.length; i++) {
						if (tmpClan.joinQueue[i][1] === conn.id) {
							isRequestSent = true
							break
						}
					}

					if (!isRequestSent) {
						tmpClan.joinQueue.push([tmpPlayer.sid, tmpPlayer.id])
						server.send(findPlayerBySID(tmpClan.ownerID).id, "an", [tmpPlayer.sid, tmpPlayer.name])
					}
				}
			}
		}

		function decideJoinRequest(sid, join) {
			let tmpPlayer = findPlayerByID(conn.id)
			if (tmpPlayer && tmpPlayer.alive && tmpPlayer.isLeader) {
				const tmpObj = findPlayerBySID(sid)
				const tmpClan = tribeManager.getTribe(tmpPlayer.team)
				if (tmpClan && tmpObj) {
					let queue = tmpClan.joinQueue.shift()
					if (queue[1] !== tmpObj.id) return
					if (join && tmpObj.team == null) {
						tmpClan.addPlayer(tmpObj)
						server.send(tmpObj.id, "st", [tmpPlayer.team, 0])
					}
				}
			}
		}

		function sendMapPing(type) {
			if (type) {
				let tmpPlayer = findPlayerByID(conn.id)
				if (tmpPlayer && tmpPlayer.alive) {
					if (tmpPlayer.team) {
						for (let i = 0; i < players.length; i++) {
							if (players[i] && players[i].team === tmpPlayer.team) {
								server.send(players[i].id, "p", [tmpPlayer.x, tmpPlayer.y])
							}
						}
					} else {
						server.send(conn.id, "p", [tmpPlayer.x, tmpPlayer.y])
					}
				}
			}
		}
	})

	let tmpA = new Player(
		conn.id,
		conn.sid,
		config,
		UTILS,
		projectileManager,
		objectManager,
		players,
		ais,
		items,
		hats,
		accessories,
		server,
		scoreCallback,
		iconCallback,
		MODE
	)
	players.push(tmpA)
	tmpA.visible = false

	server.send(conn.id, "io-init", [conn.id])
	let teamsData = []
	for (const key in tribeManager.tribes) {
		teamsData.push(tribeManager.tribes[key].getData())
	}
	server.send(conn.id, "id", [{ teams: teamsData }])
})

// GAME TICK
setInterval(() => {
	now = Date.now()
	delta = now - lastUpdate
	lastUpdate = now

	for (let i = 0; i < players.length; ++i) {
		let tmpObj = players[i]
		if (tmpObj) {
			tmpObj.update(delta)
		}
	}

	for (let i = 0; i < ais.length; i++) {
		let tmpObj = ais[i]
		if (tmpObj) {
			tmpObj.update(delta)
		}
	}

	for (let i = 0; i < players.length; ++i) {
		let tmpObj = players[i]
		if (tmpObj && tmpObj.alive) {
			if (tmpObj.shootCount > 0) {
				tmpObj.shootCount -= delta
			} else if (tmpObj.skin && tmpObj.skin.turret) {
				var tmpPlayer, bestDst, tmpDist
				for (let i = 0; i < players.length; ++i) {
					if (
						players[i].alive &&
						!(players[i].skin && players[i].skin.antiTurret) &&
						players[i].sid !== tmpObj.sid &&
						!(tmpObj.team && tmpObj.team == players[i].team)
					) {
						tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, players[i].x, players[i].y)
						if (tmpDist <= tmpObj.skin.turret.range && (!tmpPlayer || tmpDist < bestDst)) {
							bestDst = tmpDist
							tmpPlayer = players[i]
						}
					}
				}
				for (let i = 0; i < ais.length; ++i) {
					if (ais[i].alive && ais[i].hostile) {
						tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, ais[i].x, ais[i].y)
						if (tmpDist <= tmpObj.skin.turret.range && (!tmpPlayer || tmpDist < bestDst)) {
							bestDst = tmpDist
							tmpPlayer = ais[i]
						}
					}
				}
				if (tmpPlayer) {
					tmpObj.shootCount = tmpObj.skin.turret.rate
					projectileManager.addProjectile(
						tmpObj.x,
						tmpObj.y,
						UTILS.getDirection(tmpPlayer.x, tmpPlayer.y, tmpObj.x, tmpObj.y),
						tmpObj.skin.turret.range,
						1.5,
						tmpObj.skin.turret.proj,
						tmpObj
					)
				}
			}
		}
	}

	for (let i = 0; i < objectManager.updateObjects.length; i++) {
		let tmpObj = objectManager.updateObjects[i]
		if (tmpObj.shootCount > 0) {
			tmpObj.shootCount -= delta
		} else {
			var tmpPlayer, bestDst, tmpDist
			for (let i = 0; i < players.length; ++i) {
				if (
					players[i].alive &&
					!(players[i].skin && players[i].skin.antiTurret) &&
					players[i].sid !== tmpObj.owner.sid &&
					!(tmpObj.owner.team && tmpObj.owner.team == players[i].team)
				) {
					tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, players[i].x, players[i].y)
					if (tmpDist <= tmpObj.shootRange && (!tmpPlayer || tmpDist < bestDst)) {
						bestDst = tmpDist
						tmpPlayer = players[i]
					}
				}
			}
			for (let i = 0; i < ais.length; ++i) {
				if (ais[i].alive && ais[i].hostile) {
					tmpDist = UTILS.getDistance(tmpObj.x, tmpObj.y, ais[i].x, ais[i].y)
					if (tmpDist <= tmpObj.shootRange && (!tmpPlayer || tmpDist < bestDst)) {
						bestDst = tmpDist
						tmpPlayer = ais[i]
					}
				}
			}
			if (tmpPlayer) {
				tmpObj.dir = UTILS.getDirection(tmpPlayer.x, tmpPlayer.y, tmpObj.x, tmpObj.y)
				tmpObj.shootCount = tmpObj.shootRate
				projectileManager.addProjectile(tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.shootRange, 1.5, tmpObj.projectile, tmpObj.owner, tmpObj.sid)
				server.sendAll("sp", [tmpObj.sid, tmpObj.dir])
			}
		}
	}

	for (let i = 0; i < projectiles.length; i++) {
		projectiles[i].update(delta)
	}

	for (let j = 0; j < players.length; j++) {
		let tmpPlayer = players[j]
		if (tmpPlayer) {
			const tmpPlayersData = []
			for (let i = 0; i < players.length; ++i) {
				let tmpObj = players[i]
				if (tmpObj && tmpPlayer.canSee(tmpObj)) {
					if (!tmpObj.sentTo[tmpPlayer.id]) {
						tmpObj.sentTo[tmpPlayer.id] = 1
						server.send(tmpPlayer.id, "2", [
							[tmpObj.id, tmpObj.sid, tmpObj.name, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.health, tmpObj.maxHealth, config.playerScale, tmpObj.skinColor],
							tmpObj.id === tmpPlayer.id
						])
					}
					if (tmpObj.alive) {
						tmpPlayersData.push(
							tmpObj.sid,
							tmpObj.x,
							tmpObj.y,
							tmpObj.dir,
							tmpObj.buildIndex,
							tmpObj.weaponIndex,
							config.fetchVariant(tmpObj).id,
							tmpObj.team,
							tmpObj.isLeader ? 1 : 0,
							tmpObj.shameTimer > 0 ? 45 : tmpObj.skinIndex,
							tmpObj.tailIndex,
							tmpObj.iconIndex,
							tmpObj.zIndex
						)
					}
				}
			}
			server.send(tmpPlayer.id, "33", [tmpPlayersData])

			const tmpAiData = []
			for (let i = 0; i < ais.length; ++i) {
				let tmpObj = ais[i]
				if (tmpObj && tmpObj.alive && tmpPlayer.canSee(tmpObj)) {
					tmpAiData.push(tmpObj.sid, tmpObj.index, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.health, tmpObj.nameIndex)
				}
			}
			server.send(tmpPlayer.id, "a", [tmpAiData])

			const tmpObjectsData = []
			for (let i = 0; i < gameObjects.length; i++) {
				let tmpObj = gameObjects[i]
				if (tmpObj && tmpObj.active && tmpPlayer.canSee(tmpObj) && tmpObj.visibleToPlayer(tmpPlayer) && !tmpObj.sentTo[tmpPlayer.id]) {
					tmpObj.sentTo[tmpPlayer.id] = 1
					tmpObjectsData.push(tmpObj.sid, tmpObj.x, tmpObj.y, tmpObj.dir, tmpObj.scale, tmpObj.type, tmpObj.id, tmpObj.owner?.sid)
				}
			}
			server.send(tmpPlayer.id, "6", [tmpObjectsData])
		}
	}
}, 1000 / config.serverUpdateRate)

function updateLeaderboard() {
	const tmpLeaderboardData = []
	for (const player of players
		.filter((player) => player.alive)
		.sort(UTILS.sortByPoints)
		.slice(0, 10)) {
		tmpLeaderboardData.push(player.sid, player.name, player.points)
	}
	server.sendAll("5", [tmpLeaderboardData])
}

// Update Leaderboard
setInterval(() => {
	for (let i = 0; i < players.length; i++) {
		if (players[i].pps) {
			scoreCallback(players[i], players[i].pps)
		}
	}
	updateLeaderboard()
}, 1000)

// SEND MAP DATA
setInterval(() => {
	for (const key in tribeManager.tribes) {
		const tmpMembers = tribeManager.tribes[key].members
		const tmpPlayersID = []
		const posData = []
		for (let i = 0; i < tmpMembers.length; i++) {
			const tmpPlayer = findPlayerBySID(tmpMembers[i])
			tmpPlayersID.push(tmpPlayer.id)
			posData.push(tmpPlayer.x, tmpPlayer.y)
		}
		for (let i = 0; i < tmpPlayersID.length; i++) {
			server.send(tmpPlayersID[i], "mm", [posData.filter((value, index) => ![i * 2, i * 2 + 1].includes(index))])
		}
	}
	for (let i = 0; i < players.length; i++) {
		if (players[i].team == null) {
			server.send(players[i].id, "mm", [0])
		}
	}
}, 3000)

function scoreCallback(player, amount, setResource) {
	player.points += amount
	player.earnXP(amount)
	server.send(player.id, "9", ["points", Math.round(player.points), 1])
}

function iconCallback() {
	var highestKill = 0
	var highest = null
	for (let i = 0; i < players.length; i++) {
		const player = players[i]
		player.iconIndex = 0
		if (player && player.alive && player.kills > 0 && (highest == null || highestKill < player.kills)) {
			highest = i
			highestKill = player.kill
		}
	}
	if (highest !== null) {
		players[highest].iconIndex = 1
	}
}

function addBossArenaStones(stoneCount, stoneScale, xCenter, yCenter) {
	const arenaScale = (stoneScale * stoneCount) / Math.PI
	for (let i = 0; i <= stoneCount; i++) {
		let tmpX = xCenter + arenaScale * Math.cos((i * 2 * Math.PI) / stoneCount)
		let tmpY = yCenter + arenaScale * Math.sin((i * 2 * Math.PI) / stoneCount)
		let size = UTILS.randInt(0, 1)
		if (i === 0) {
			tmpX -= 175
			size = 2
		} else if (i === stoneCount) {
			tmpX += 175
			size = 2
		}
		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), config.rockScales[size], 2, null, true, null)
	}
}

function addTree(treeCount) {
	for (let j = 0; j < treeCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, 12000)
		const size = config.treeScales[UTILS.randInt(0, 3)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < 100 + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 0, null, true, null)
	}
}

function addBush(bushCount) {
	for (let j = 0; j < bushCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, 12000)
		const size = config.bushScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < 100 + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 1, null, true, null)
	}
}

function addCacti(cactiCount) {
	for (let j = 0; j < cactiCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randFloat(12000, config.mapScale)
		const size = config.bushScales[2]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < 100 + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		const tmpObj = objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 1, null, true, null)
		tmpObj.dmg = 35
	}
}

function addStoneGold(stoneCount, isStone) {
	for (let j = 0; j < stoneCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randInt(0, 1) ? UTILS.randFloat(0, 6850) : UTILS.randFloat(7550, config.mapScale)
		const size = config.rockScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < 100 + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, isStone ? 2 : 3, null, true, null)
	}
}

function addRiverStone(riverStoneCount) {
	for (let j = 0; j < riverStoneCount; j++) {
		const tmpX = UTILS.randFloat(0, config.mapScale)
		const tmpY = UTILS.randFloat(6850, 7550)
		const size = config.rockScales[UTILS.randInt(0, 2)]
		let overlap

		for (let i = 0; i < gameObjects.length; i++) {
			if (UTILS.getDistance(tmpX, tmpY, gameObjects[i].x, gameObjects[i].y) < 100 + size) {
				overlap = true
				break
			}
		}
		if (overlap) continue

		objectManager.add(objectManager.objects.length, tmpX, tmpY, UTILS.randFloat(-Math.PI, Math.PI), size, 2, null, true, null)
	}
}

function addAnimal() {
	const animalCount = [10, 10, 10, 2, 15, 2, 1, 1, 1]
	for (let i = 0; i < animalCount.length; i++) {
		for (let j = 0; j < animalCount[i]; j++) {
			aiManager.spawn(
				animalCount[i] === 1 ? config.mapScale / 2 : UTILS.randFloat(0, config.mapScale),
				animalCount[i] === 1 ? config.mapScale - config.snowBiomeTop / 2 : UTILS.randFloat(0, config.mapScale),
				Math.PI / 2,
				i
			)
		}
	}
}

function setupServer() {
	config.isStarted = false
	ais = []
	players = []
	gameObjects = []
	projectiles = []
	connection = []
	playersSid = []
	objectManager = new ObjectManager(GameObject, gameObjects, UTILS, config, players, server)
	aiManager = new AiManager(ais, AI, players, items, objectManager, config, UTILS, scoreCallback, server)
	projectileManager = new ProjectileManager(Projectile, projectiles, players, ais, objectManager, items, config, UTILS, server)
	tribeManager = new TribeManager(Tribe, findPlayerBySID, server)

	server.clients.forEach((socket) => {
		if (socket.readyState === WebSocket.OPEN) {
			socket.close()
		}
	})

	if (["NORMAL", "SANDBOX", "ZOMBIE"].includes(MODE)) {
		config.inSandbox = MODE === "SANDBOX"
		config.canHitObj = true
		addBossArenaStones(config.totalRocks - 1, config.rockScales[1], config.mapScale / 2, config.mapScale - config.snowBiomeTop / 2)
		addTree(200)
		addBush(100)
		addCacti(20)
		addStoneGold(100, true)
		addStoneGold(10, false)
		addRiverStone(15)
		addAnimal()
	} else if (MODE === "HOCKEY") {
		config.canHitObj = false
		for (let i = 0; i < 40; i++) {
			objectManager.add(objectManager.objects.length, 3000 + i * items.list[18].scale * 2, 3000, 0, items.list[18].scale, items.list[18].id, items.list[18])
			objectManager.add(
				objectManager.objects.length,
				3000 + i * items.list[18].scale * 2,
				3000 + 19 * items.list[18].scale * 2,
				0,
				items.list[18].scale,
				items.list[18].id,
				items.list[18]
			)
		}
		for (let i = 0; i < 20; i++) {
			if (i >= 7 && i <= 12) continue
			objectManager.add(
				objectManager.objects.length,
				3000,
				3000 + i * items.list[18].scale * 2,
				Math.PI / 2,
				items.list[18].scale,
				items.list[18].id,
				items.list[18]
			)
			objectManager.add(
				objectManager.objects.length,
				3000 + 39 * items.list[18].scale * 2,
				3000 + i * items.list[18].scale * 2,
				Math.PI / 2,
				items.list[18].scale,
				items.list[18].id,
				items.list[18]
			)
		}

		playersSid = [1]
		let tmpA = new Player(
			UTILS.randomString(10),
			1,
			config,
			UTILS,
			projectileManager,
			objectManager,
			players,
			ais,
			items,
			hats,
			accessories,
			server,
			scoreCallback,
			iconCallback,
			MODE
		)
		players.push(tmpA)
	}
}

// Cambiamos el servidor http para usar la app express
const httpServer = http.createServer(app)

// Mantenemos el upgrade para websockets
httpServer.on("upgrade", (request, socket, head) => {
	const pathname = url.parse(request.url).pathname?.replace(/\/$/, "")

	if (pathname === "/server") {
		server.handleUpgrade(request, socket, head, (ws) => {
			server.emit("connection", ws, request)
		})
	} else {
		socket.destroy()
	}
})

httpServer.listen(PORT, () => {
	setupServer()
	commandStart()
})

async function commandStart() {
	console.clear()
	if (!(await checkLatest())) {
		console.log("Update available at https://github.com/kookywarrior/moomooio-private-server")
	}
	console.log(`Private server listening at http://localhost:${PORT}\n`)
	const command = await inquirer.prompt({
		name: "command",
		type: "list",
		message: "Custom command",
		choices: ["Change mode", "Change password", "Change prefix", "Kick player", "Restart server"]
	})
	if (command.command === "Change mode") {
		const mode = await inquirer.prompt({
			name: "mode",
			type: "list",
			message: "Select mode",
			choices: ["NORMAL", "SANDBOX", "HOCKEY"]
		})
		const modeType = [["HOCKEY"], ["SANDBOX", "NORMAL"]]
		function areInSameGroup(arg1, arg2) {
			for (const group of modeType) {
				if (group.includes(arg1) && group.includes(arg2)) {
					return true
				}
			}
			return false
		}

		if (areInSameGroup(MODE, mode.mode)) {
			MODE = mode.mode
		} else {
			const restart = await inquirer.prompt({
				name: "restart",
				type: "confirm",
				message: "Are you sure you want to restart server?"
			})
			if (restart.restart) {
				MODE = mode.mode
				setupServer()
			}
		}
	} else if (command.command === "Change password") {
		const password = await inquirer.prompt({
			name: "password",
			type: "input",
			message: "Input password:"
		})
		PASSWORD = password.password
	} else if (command.command === "Change prefix") {
		const prefix = await inquirer.prompt({
			name: "prefix",
			type: "list",
			message: "Select prefix",
			choices: ["!", "?", "/", "\\", "`", "'", '"', ":", "|", ";", "<", ">", ",", ".", "~"]
		})
		PREFIX = prefix.prefix
	} else if (command.command === "Kick player") {
		const sid = await inquirer.prompt({
			name: "sid",
			type: "number",
			message: "Input player sid:"
		})
		if (sid.sid != null) {
			for (let i = 0; i < players.length; i++) {
				let tmpPlayer = players[i]
				if (tmpPlayer.sid === sid.sid) {
					if (MODE === "HOCKEY" && sid.sid !== 1) {
						connection[tmpPlayer.id].close()
						break
					} else {
						connection[tmpPlayer.id].close()
						break
					}
				}
			}
		}
	} else if (command.command === "Restart server") {
		const restart = await inquirer.prompt({
			name: "restart",
			type: "confirm",
			message: "Are you sure you want to restart server?"
		})
		if (restart.restart) {
			setupServer()
		}
	}
	commandStart()
                            }
