(function($)
{
	var NICK_MAX_LENGTH = 15,
		ROOM_MAX_LENGTH = 10,
		lockShakeAnimation = false,
		socket = null,
		clientId = null,
		nickname = null,
		currentRoom = null,

		tmplt = {
			room: [			
				'<a href="javascript:void(0)" data-roomId="${room}" class="list-group-item">',
					'${room}',
				'</a>'
			].join(""),
			client: [			
				'<div data-clientId="${clientId}" class="list-group-item">',
					'${nickname}',
				'</div>'
			].join("")
		};
	
	//WEBRTC Variables	
	var isChannelReady = false;
	var isInitiator;
	var isStarted = false;
	var localStream;
	var pc;
	var remoteStream;
	var turnReady;
	var room = '';
	var pc_config = webrtcDetectedBrowser === 'firefox' ?
	  {'iceServers':[{'url':'stun:23.21.150.121'}]} : // number IP
	  {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

	var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

	// Set up audio and video regardless of what devices are present.
	var sdpConstraints = {'mandatory': {
	  'OfferToReceiveAudio':true,
	  'OfferToReceiveVideo':true }};

	var localVideo = document.querySelector('#localVideo');
	var remoteVideo = document.querySelector('#remoteVideo');
	var constraints = {video: true, audio: true};
	// END

	function bindDOMEvents()
	{
		$('.action').tooltip({
			placement : 'top'
		});
		$('.audio').tooltip({
			placement : 'top'
		});
		
		$('.error').hide();
		$('.info').show();
		$('#signin').show();
		$('#open-channel').hide();
		$('#channels').hide();
		$('#channel-error').hide();
		
		/*$('.toggle').click(function()
		{
			var col = $(this).css('color');
			
			if ($(this).find('span').hasClass('glyphicon-volume-up'))
			{
				$(this).find('span').removeClass('glyphicon-volume-up');
				$(this).find('span').addClass('glyphicon-volume-off');
				$(this).attr('data-original-title', 'Unmute');
			}
			else if ($(this).find('span').hasClass('glyphicon-volume-off'))
			{
				$(this).find('span').removeClass('glyphicon-volume-off');
				$(this).find('span').addClass('glyphicon-volume-up');
				$(this).attr('data-original-title', 'Mute');
			}
			
			if (col == 'rgb(34, 34, 34)')
			{
				$(this).css('color', '#999');
			}
			else
			{
				$(this).css('color', '#222');
			}	
		});*/
		
		$('#txtUsername').on('keydown', function(e)
		{
			var key = e.which || e.keyCode;
			if(key == 13) { handleNickname(); }
		});
		
		$('#btnUsername').on('click', function()
		{
			handleNickname();
		});
		
		$('#txtChannel').on('keydown', function(e)
		{
			var key = e.which || e.keyCode;
			if(key == 13) { createRoom(); }
		});
		
		$('#btnChannel').on('click', function()
		{
			createRoom();
		});
		
		$('#rooms a').live('click', function(e)
		{

			var room = $(this).attr('data-roomId');
			//console.log(room);
			//console.log(currentRoom);
			if(room != currentRoom)
			{
				socket.emit('unsubscribe', { room: currentRoom });
				socket.emit('subscribe', { room: room });
			}
		});		
	}

	function bindSocketEvents(){

		socket.on('connect', function()
		{
			socket.emit('connect', { nickname: nickname });
		});
		
		socket.on('ready', function(data)
		{			
			clientId = data.clientId;
		});
		
		socket.on('message', function(message)
		{
			console.log("S -> C " + message.type + " --- " + message);
			maybeStart();
		});

		socket.on('roomslist', function(data)
		{
			for(var i = 0, len = data.rooms.length; i < len; i++)
			{
				if(data.rooms[i] != '')
				{
					addRoom(data.rooms[i], false);
				}
			}
		});
		
		socket.on('roomclients', function(data){
			
			addRoom(data.room, false);
			setCurrentRoom(data.room);
			$('#users').empty();
			
			addClient({ nickname: nickname, clientId: clientId }, false, true);
			for(var i = 0, len = data.clients.length; i < len; i++){
				if(data.clients[i])
				{
					addClient(data.clients[i], false);
				}
			}
		});
		
		socket.on('numofclients', function(data)
		{
			if (data.numofclients > 1)
			{
				isChannelReady = true;
			}
				
			else
			{
				isChannelReady = false;
				isStarted = false;
			}
				
			console.log(isChannelReady);
				
		});
		
		socket.on('addroom', function(data)
		{
			addRoom(data.room, true);
		});
		
		socket.on('removeroom', function(data)
		{
			removeRoom(data.room, true);
		});
		
		socket.on('presence', function(data)
		{
			if(data.state == 'online'){
				addClient(data.client, true);
			} else if(data.state == 'offline'){
				removeClient(data.client, true);
			}
		});
		
		socket.on('log', function (array){
			  console.log.apply(console, array);
			});
	}
	
	function sendMessage(message)
	{
		socket.emit('message', message);
		//console.log("SENDING MESSAGE : " + message.type + " --- " + message);
	}

	function addRoom(name, announce)
	{
		name = name.replace('/','');

		if($('#rooms a[data-roomId="' + name + '"]').length == 0)
		{
			$.tmpl(tmplt.room, { room: name }).appendTo('#rooms');
		}
	}

	function removeRoom(name, announce)
	{
		$('#rooms a[data-roomId="' + name + '"]').remove();
	}

	function addClient(client, announce, isMe)
	{
		var $html = $.tmpl(tmplt.client, client);
		
		if(isMe)
		{
			$html.addClass('alert alert-success');
		}
		
		$html.appendTo('#users');
	}

	function removeClient(client, announce)
	{
		$('#users .list-group-item[data-clientId="' + client.clientId + '"]').remove();
	}

	function createRoom()
	{
		var room = $('#txtChannel').val().trim();
		
		if (room == '')
		{
			$('#createChannel .error').show();
			$('#createChannel .error').html("Channel name cannot be empty");
		}
		else if(room && room.length <= ROOM_MAX_LENGTH && room != currentRoom)
		{
			socket.emit('unsubscribe', { room: currentRoom });
			socket.emit('subscribe', { room: room });
			$('#createChannel').modal('hide');
			$('#txtChannel').val('');
		} 
		else 
		{
			$('#createChannel .error').html("Channel Name should be more than 10 characters. Try again.");
			$('#txtChannel').val('');
		}
	}

	function setCurrentRoom(room)
	{
		currentRoom = room;
		$('#channel-title').html(currentRoom);
		$('#rooms a.alert').removeClass('alert alert-success');
		$('#rooms a[data-roomId="' + room + '"]').addClass('alert alert-success');
	}

	function handleNickname()
	{
		var nick = $('#txtUsername').val().trim();
		$('.info').hide();
		
		if (nick == '')
		{
			$('.info').hide();
			$('#signin .error').show();
			$('#signin .error').html("Username cannot be empty");
		}
		else if (nick && nick.length <= NICK_MAX_LENGTH)
		{
			nickname = nick;
			$('#signin').hide();
			$('#open-channel').show();
			$('#channels').show();
			$('#txtUsername').val('');
			connect();
			initiate();
		} 
		else 
		{
			$('#signin .error').html("User Name should be more than 15 characters. Try again.");
			$('#txtUsername').val('');
		}
	}

	function connect()
	{
		socket = io.connect();
		bindSocketEvents();
	}

	$(function()
	{
		bindDOMEvents();
	});
	
	window.onbeforeunload = function(e)
	{
		sendMessage('clientId : ' + clientId + ' nickname : ' + nickname + ' has exited from ' + currentRoom);
	}
	
	/********************************  WebRTC Now ******************************/
	
	function handleUserMedia(stream)
	{
		localStream = stream;
		attachMediaStream(localVideo, stream);
		sendMessage('Got User Media');
	}

	function handleUserMediaError(error)
	{
		  console.log('ERROR - User Media : ', error);
	}

	function initiate()
	{
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || false;
		navigator.getUserMedia(constraints, handleUserMedia, handleUserMediaError);
	}
	
	function maybeStart() 
	{
		if (!isStarted && localStream && isChannelReady)
		{
			createPeerConnection();
			pc.addStream(localStream);
			isStarted = true;
			/*if (isInitiator) 
			{
				doCall();
			}*/
		}
	}
	
	function createPeerConnection()
	{
		try 
		{
		   pc = new RTCPeerConnection(pc_config, pc_constraints);
		   pc.onicecandidate = handleIceCandidate;
		   console.log('Created RTCPeerConnnection with:\n' +
		     '  config: \'' + JSON.stringify(pc_config) + '\';\n' +
		     '  constraints: \'' + JSON.stringify(pc_constraints) + '\'.');
		}
		catch (e) 
		{
			//console.log('Failed to create PeerConnection, exception: ' + e.message);
			alert('Cannot create RTCPeerConnection object.');
			return;
		}
	}
	
	function handleIceCandidate(event) 
	{	
		//console.log('handleIceCandidate event: ', event);
		if (event.candidate) 
		{
			sendMessage({
			type: 'candidate',
			label: event.candidate.sdpMLineIndex,
			id: event.candidate.sdpMid,
			candidate: event.candidate.candidate});
		}
		else 
		{
		//console.log('End of candidates.');
		}
	}
	

})(jQuery);