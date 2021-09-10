const fs = require('fs');
const EventEmitter = require('events');
const Socket = require('net').Socket;
const NOOP = ()=> { };
const CONST_FILE_LINE_START = "file:";

if(!String.prototype.trim) {
	(function() {
		// Make sure we trim BOM and NBSP
		let rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
		String.prototype.trim = function() {
			return this.replace(rtrim, '');
		};
	})();
}

if(!String.prototype.startsWith) {
	String.prototype.startsWith = function(searchString, position) {
		position = position || 0;
		return this.lastIndexOf(searchString, position) === position;
	};
}
class MPD extends EventEmitter {
	constructor(obj) {
		super();
		console.log('constructor');
		this.port = obj.port ? obj.port : 6600;
		this.host = obj.host ? obj.host : "localhost";
		this._requests = [];
		this.connected = false;
		this.disconnecting = false;
		this.status = {};
		this.server = {};
		this.playlist = [];
		this.songs = [];
		this.buffer = "";
		this.on('disconnected', this.restoreConnection.bind(this));
	};

	/*
	* Top Level Methods
	*/

	play(callback) {
		this._sendCommand("play", (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	seek(song,time,callback) {
		this._sendCommand("seek", song, time, (r) =>{
			this._answerCallbackError(r, callback);
		});
	};


	pause(callback) {
		this._sendCommand("pause", (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	next(callback) {
		this._sendCommand("next", (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	clear(callback) {
		this._sendCommand("clear", (r) => {
			this._answerCallbackError(r, callback);
		});
	};

	prev(callback) {
		this._sendCommand("previous", (r) => {
			this._answerCallbackError(r, callback);
		});
	};

	toggle(callback) {
		this._sendCommand("toggle", (r) => {
			this._answerCallbackError(r, callback);
		});
	};

	_currentSong(callback) {
		this._sendCommand("currentsong", (message) => {
			let result = {};
			let array = message.split("\n");
			for(let i in array) {
				let keyValue = array[i].split(":");
				if(keyValue.length < 2) {
					if(array[i] !== "OK") {
						this.restoreConnection();
						throw new Error("Unknown response while fetching current song.");
					}
					else {
						continue;
					}
				}
				let key = keyValue[0].trim().toLowerCase();
				let value = keyValue.slice(1).join(':').trim();
				result[key] = value;
			}
			callback(result);
		});
	};


	updateSongs(callback) {
		this._sendCommand("update", (r) => {
			let arr = r.split(/\n/);
			this._answerCallbackError(arr[1], callback);
		});
	};

	add(name, callback) {
		this._sendCommand("add", name, (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	repeat(state, callback) {
		this._sendCommand("repeat", (parseInt(state)==1?'1':'0'), (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	random(state, callback) {
		this._sendCommand("random", (parseInt(state)==1?'1':'0'), (r) =>{
			this._answerCallbackError(r, callback);
		});
	};


	volume(vol, callback) {
		this._sendCommand("setvol", vol, (r) =>{
			this._answerCallbackError(r, callback);
		});
	};

	searchAdd(search, callback) {
		let args = ["searchadd"];
		for(let key in search) {
			args.push(key);
			args.push(search[key]);
		}
		args.push(r => {
			this._answerCallbackError(r, callback);
		});
		this._sendCommand.apply(this, args);
	};

	_answerCallbackError(r, cb) {
		let err = this._checkReturn(r);
		if(cb) {
			if (err == null) cb('OK'); else cb(err);
		}
		else {
			if(err) {
				throw err;
			}
		}
	};

	/*
	* Connect and disconnect
	*/

	connect() {
		try{
			this.client = new Socket();
			this.client.setEncoding('utf8');
			this.commanding = true;
			this.disconnecting = false;
			this.connected = false;
			this.client.once('end', ()=> {
				if(!this.disconnecting) {
					this.connected = false;
					this.emit('disconnected');
				}
			});
			this.client.on('error', (e)=>{
				this.emit('error', e);
				this.emit('disconnected');
			});
			this.client.connect(this.port, this.host, () => {
				this.connected = true;
				clearInterval(this.reconnectInterval);
				this.reconnectInterval = null;
				this.client.once('data', this._initialGreeting.bind(this));
			});
			return 1;
		}catch(e){
			this.restoreConnection();
			return 0;
		}
	};

	restoreConnection(){
		console.log('init restore connection');
		if(!this.reconnectInterval){
			this.reconnectInterval = setInterval(() => {
				if(!this.connected){				
					this.disconnect();
				} else {
					console.log('try reconnect');
					this.connect();
				}
			}, 1000);
		}
		return 1;
	};

	disconnect() {
		this.disconnecting = true;
		this.busy = false;
		this._activeListener = null;
		this._requests.splice(0, this._requests.length);
		if (this.client) {
			this.client.destroy();
			delete this.client;
		}
	};

	/*
	* Not-so-toplevel methods
	*/

	/*MPD.prototype._updatePlaylist = function(callback) {
		this._sendCommand("playlistinfo", (message) => {
			let lines = message.split("\n");
			this.playlist = [];
			let songLines = [];
			let pos;
			for(let i = 0; i < lines.length - 1; i++) {
				let line = lines[i];
				if(i !== 0 && line.startsWith("file:")) {
					this.playlist[pos] = new Song(songLines);
					songLines = [];
					pos = -1;
				}
				if(line.startsWith("Pos")) {
					pos = parseInt(line.split(":")[1].trim());
				}
				else {
					songLines.push(line);
				}
			}
			if(songLines.length !== 0 && pos !== -1) {
				this.playlist[pos] = new Song(songLines);
			}
			let err = this._checkReturn(lines[lines.length - 1]);
			if(err) { throw err; }
			if(callback) {
				callback(this.playlist);
			}
		});
	};*/

	getFolderInfo(folder, callback) {
		if (folder!='') folder = ' "'+folder+'"';
		this._sendCommand("lsinfo"+folder, (message) => { //info
			let lines = message.split("\n");
			let folder = [];
			item = null;
			for(let i = 0; i < lines.length - 1; i++) {
				let line = lines[i];
				let parts = line.split(': ');
				if(['file','directory','playlist'].indexOf(parts[0])>-1) {
					if (item!=null && item.type!='playlist') folder.push(item);
					item = {'type':parts[0],'file':parts[1],'title':parts[1].split('/').slice(-1)[0]};
					let cover = null;
					if (parts[0]=='directory') {
						cover = parts[1]+'/_front.jpg';        
						fs.exists('public/mp3/'+cover,(exists)=>{if (exists) item['cover'] = cover});
						cover = parts[1]+'/_folder.jpg';        
						fs.exists('public/mp3/'+cover,(exists)=>{if (exists) item['cover'] = cover});
					} else {
						cover = parts[1].split('/').slice(0, -1).join('/')+'/_front.jpg';        
						fs.exists('public/mp3/'+cover,(exists)=>{if (exists) item['cover'] = cover});
					}
				} else {
					if (item!=null) 
						item[parts[0]]=parts[1];
				}
			}
			if (item!=null) folder.push(item);
			let err = this._checkReturn(lines[lines.length - 1]);
			if(err) { throw err; }
			if(callback) {
				callback(folder);
			}
		});
	};


	/*MPD.prototype._updateSongs = function(callback) {
		this._sendCommand("listall", (message) => { //info
			let lines = message.split("\n");
			this.songs = [];
			let songLines = [];
			for(let i = 0; i < lines.length - 1; i++) {
				let line = lines[i];
				if(i !== 0 && line.startsWith(CONST_FILE_LINE_START)) {
					this.songs.push(new Song(songLines));
					songLines = [];
				}
				songLines.push(line);
			}
			if(songLines.length !== 0) {
				this.songs.push(new Song(songLines));
			}
			let err = this._checkReturn(lines[lines.length - 1]);
			if(err) { throw err; }
			if(callback) {
				callback(this.songs);
			}
		});
	};*/

	updateStatus(callback) {
		try{
			this._sendCommand("status", (message) =>{
				let array = message.split("\n");
				for(let i in array) {
					let keyValue = array[i].split(":");
					if(keyValue.length < 2) {
						if(array[i] !== "OK") {
							this.restoreConnection();
							throw new Error("Unknown response while fetching status.");
						}
						else {
							continue;
						}
					}
					let key = keyValue[0].trim();
					let value = keyValue[1].trim();
					switch(key) {
					case "volume":
						this.status.volume = parseFloat(value.replace("%", ""));
						break;
					case "repeat":
						this.status.repeat = (value === "1");
						break;
					case "random":
						this.status.random = (value === "1");
						break;
					case "single":
						this.status.single = (value === "1");
						break;
					case "consume":
						this.status.consume = (value === "1");
						break;
					case "playlistlength":
						this.status.playlistlength = parseInt(value);
						break;
					case "state":
						this.status.state = value;
						break;
					case "xfade":
						this.status.xfade = parseInt(value);
						break;
					case "song":
						this.status.song = parseInt(value);
						break;
					case "time":
						this.status.time = {
							elapsed : parseInt(keyValue[1]),
							length : parseInt(keyValue[2])
						};
						break;
					case "bitrate":
						this.status.bitrate = parseInt(value);
						break;
					}
				}
				this._currentSong(current=>{
					this.status.current = current;
					if(callback) {
						callback(this.status, this.server);
					}	
				})
			});
		}catch(e){
			this.emit('error', e);
		}
	};

	/*
	* Idle handling
	*/

	_onMessage(message) {
		try{
			let match;
			if(!(match = message.match(/changed:\s*(.*?)\s+OK/))) {
				this.restoreConnection();
				throw new Error("Received unknown message during idle: " + message);
			}
			this._enterIdle();
			let updated = match[1];
			let afterUpdate = () =>{this.emit("update", updated);};
			switch(updated) {
			case "mixer":
			case "player":
			case "options":
				this.updateStatus(afterUpdate);
				break;
	/*		case "playlist":
				this._updatePlaylist(afterUpdate);
				break;*/
	/*		case "database":
				this._updateSongs(afterUpdate);
				break;*/
			}
		}catch(e){
			this.emit('error', e);
		}
	};

	/*
	* Message handling
	*/

	_initialGreeting(message) {
		//console.log("Got initial greeting: " + message);
		let m;
		if(m = message.match(/OK\s(.*?)\s((:?[0-9]|\.))/)) {
			this.server.name = m[1];
			this.server.version = m[2];
		}
		else {
			this.restoreConnection();
			throw new Error("Unknown values while receiving initial greeting");
		}
		this._enterIdle();
		this.client.on('data', this._onData.bind(this));
		//this._enterIdle();
		this.updateStatus(() => {
			this.emit('ready', this.status, this.server);
			/*this.getFolderInfo('',((result)=>{
				this.root = result;
			}).bind(this));*/
		});
	};

	_setReady() {
		this.emit('ready', this.status, this.server);
	};

	findReturn(message) {
		let arr;
		let rOk = /OK(?:\n|$)/g;
		let rAck = /ACK\s*\[\d*\@\d*]\s*\{.*?\}\s*.*?(?:$|\n)/g;
		if(arr = rOk.exec(message)) {
			return arr.index + arr[0].length;
		}
		else if(arr = rAck.exec(message)) {
			return arr.index + arr[0].length;
		}
		else return -1;
	}

	_onData(message) {
		if(!message) {
			message = "";
		}
		message = message.trim();
		//console.log("RECV: " + message);
		if(this.idling || this.commanding) {
			this.buffer += message;
			let index;
			if((index = this.findReturn(this.buffer)) !== -1) { // We found a return mark
				let string = this.buffer.substring(0, index).trim();
				this.buffer = this.buffer.substring(index, this.buffer.length);
				//console.log("PARSED: " + string);
				//console.log("Message returned: " + string);
				if(this.idling) {
					this._onMessage(string);
				}
				else if(this.commanding) {
					//console.log("onData response for: \"" + message + "\"");
					this._handleResponse(string);
				}
			}
			//else console.log("Doesn't have return: " + this.buffer);
		}
	};

	_checkReturn(msg) {
		if(msg !== 'OK') {
			//return new Error(`Non okay return status: "${msg}"`);
			return 
		}
	};

	/*
	* Idling
	*/

	_enterIdle() {
		this.idling = true;
		this.commanding = false;
		this._write("idle");
	};

	_leaveIdle(callback) {
		this.idling = false;
		this.client.once("data", () =>{
			//this._checkReturn(message.trim());
			this.commanding = true;
			callback();
		});
		this._write("noidle");
	};

	_checkIdle() {
		//console.log(this._requests.length + " pending requests");
		if(!this._activeListener && this._requests.length == 0 && !this.idling) {
			//console.log("No more requests, entering idle.");
			this._enterIdle();
		}
	};

	/*
	* Sending messages
	*/

	_checkOutgoing() {
		let request;
		if(this._activeListener || this.busy) {
			//console.log("No deque as active listener.");
			return;
		}
		if(request = this._requests.shift()) {
			//console.log("Pending deque, leaving idle.");
			this.busy = true;
			let deque = () => {
				//console.log("Dequed.");
				this._activeListener = request.callback;
				this.busy = false;
				this._write(request.message);
			};
			if(this.idling) {
				this._leaveIdle(deque);
			}
			else {
				deque();
			}
		}
	};

	_sendCommand() {
		let cmd = "", args = "", callback;
		if(arguments.length == 0) {
			return;
		}
		if(arguments.length >= 1) {
			cmd = arguments[0];
		}
		if(arguments.length >= 2) {
			callback = arguments[arguments.length - 1];
		}
		for(let i = 1; i < arguments.length -1; i++) {
			args += " \"" + arguments[i] + "\" ";
		}
		if(!callback) {
			callback = NOOP;
		}
	//	if (cmd!='status') console.log(cmd + args);
		this._send(cmd + args, callback);
	};

	_send(message, callback) {
		this._requests.push({
			message : message,
			callback : callback
		});
		//console.log("Enqueued: " + message, ", " + this._requests.length + " pending");
		this._checkOutgoing();
	};

	_handleResponse(message) {
		let callback;
		//console.log("Handling response: \"" + message + "\" active listener is " + this._activeListener);
		if(callback = this._activeListener) {
			this._activeListener = null;
			this._checkOutgoing();
			//console.log("Checking idle as message was sucessfully answered.");
			this._checkIdle();
			callback(message);
		}
	};

	_write(text) {
		try{
			if(this.connected){
				this.client.write(text + "\n");
			}else{
				this.restoreConnection();
				throw new Error('Disconnect while writing to MPD: ' + text);
			}
		}catch(e){
			this.emit('error',e);
		}
	};
}
exports.MPD = MPD;