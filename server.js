var server = require('http').createServer(handler),
	io = require('socket.io').listen(server),
	static = require('node-static'),
	chatClients = new Object();
	
var	file = new static.Server({
		cache : 600,
		headers : {'Access-Control-Allow-Origin' : '*'}
	});
	
server.listen(process.env.PORT || 2013);

function handler(req, res)
{
	//res.writeHead(200, {'Access-Control-Allow-Origin' : '*'});
	req.addListener('end', function()
	{
		file.serve(req, res);
	}).resume();
}

io.set('log level', 2);

/* Because of the configuration below socket.on(disconnect) was not being called. Figure out why.*/

/*io.configure(function () {
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 10); 
});*/

io.sockets.on('connection', function (socket)
{
	socket.on('connect', function(data){
		connect(socket, data);
	});
	
	socket.on('subscribe', function(data){
		subscribe(socket, data);
	});

	socket.on('unsubscribe', function(data){
		unsubscribe(socket, data);
	});
	
	socket.on('disconnect', function(){
		disconnect(socket);
	});
	
	socket.on('message', function(data)
	{
		log(data);
		socket.broadcast.emit('message', data); // SHOULD BE ONLY ROOM. CHANGE TO ROOM AFTERWARDS.
	});
	
	function log()
	{
		var array = ["C -> S : "];
	  	for (var i = 0; i < arguments.length; i++)
	  	{
	  		array.push(arguments[i]);
	  	}
	    socket.emit('log', array);
	    console.log(array);
	}
});

function connect(socket, data)
{
	data.clientId = generateId();
	chatClients[socket.id] = data;
	socket.emit('ready', { clientId: data.clientId });
	subscribe(socket, { room: 'Lobby' });
	socket.emit('roomslist', { rooms: getRooms() });
}

function disconnect(socket)
{
	//console.log("Disconnect called");
	var rooms = io.sockets.manager.roomClients[socket.id];

	for(var room in rooms)
	{
		if(room && rooms[room])
		{
			unsubscribe(socket, { room: room.replace('/','') });
		}
	}

	delete chatClients[socket.id];
}

function subscribe(socket, data)
{
	
	var rooms = getRooms();

	if(rooms.indexOf('/' + data.room) < 0)
	{
		socket.broadcast.emit('addroom', { room: data.room });
	}

	socket.join(data.room);

	updatePresence(data.room, socket, 'online');

	socket.emit('roomclients', { room: data.room, clients: getClientsInRoom(socket.id, data.room) });
	io.sockets.in(data.room).emit('numofclients', { room: data.room, numofclients: countClientsInRoom(data.room) });
	//console.log(countClientsInRoom(data.room));
}

function unsubscribe(socket, data)
{
	//console.log("Unsubscribe called");
	updatePresence(data.room, socket, 'offline');
	socket.leave(data.room);
	if(!countClientsInRoom(data.room))
	{
		io.sockets.emit('removeroom', { room: data.room });
	}
	else
	{
		io.sockets.in(data.room).emit('numofclients', { room: data.room, numofclients: countClientsInRoom(data.room) });
	}		
}

function getRooms()
{
	return Object.keys(io.sockets.manager.rooms);
}

function getClientsInRoom(socketId, room)
{
	var socketIds = io.sockets.manager.rooms['/' + room];
	var clients = [];
	
	if(socketIds && socketIds.length > 0)
	{
		socketsCount = socketIds.length;
		
		for(var i = 0, len = socketIds.length; i < len; i++)
		{
			if(socketIds[i] != socketId)
			{
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}
	//console.log(clients);
	return clients;
}

function countClientsInRoom(room)
{
	if(io.sockets.manager.rooms['/' + room])
	{
		return io.sockets.manager.rooms['/' + room].length;
	}
	return 0;
}

function updatePresence(room, socket, state)
{
	//console.log("Update Presence called");
	room = room.replace('/','');
	socket.broadcast.to(room).emit('presence', { client: chatClients[socket.id], state: state, room: room });
}

function generateId()
{
	var S4 = function () {
		return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
	};
	return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

console.log('Server is running and listenting...');