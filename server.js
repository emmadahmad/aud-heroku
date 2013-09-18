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
}

function unsubscribe(socket, data)
{
	updatePresence(data.room, socket, 'offline');
	socket.leave(data.room);
	if(!countClientsInRoom(data.room))
	{
		io.sockets.emit('removeroom', { room: data.room });
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
		socketsCount = socketIds.lenght;
		
		for(var i = 0, len = socketIds.length; i < len; i++)
		{
			if(socketIds[i] != socketId)
			{
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}
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