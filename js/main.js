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
	var isInitiator = false;
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
	  'OfferToReceiveVideo':false }};

	var localVideo = document.querySelector('#localVideo');
	var remoteVideo = document.querySelector('#remoteVideo');
	var constraints = {video: false, audio: true};
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
				if (isStarted)
				{
					hangup();
				}
				socket.emit('subscribe', { room: room });
				initiate();
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
			console.log("S -> C " + message.mes.type + " --- " + message.mes);
			if (message.mes === 'Got User Media')
			{
				maybeStart();
			}
				
			else if (message.mes.type === 'offer')
			{
				if (!isInitiator && !isStarted)
				{
					maybeStart();
				}
				pc.setRemoteDescription(new RTCSessionDescription(message.mes));
				doAnswer();
			}
			
			else if (message.mes.type === 'answer' && isStarted)
			{
				pc.setRemoteDescription(new RTCSessionDescription(message.mes));
			}
			
			else if (message.mes.type === 'Candidate' && isStarted)
			{
				var candidate = new RTCIceCandidate({sdpMLineIndex:message.mes.label, candidate:message.mes.candidate});
				pc.addIceCandidate(candidate);
			}
			
			else if (message.mes === 'Bye' && isStarted)
			{
				handleRemoteHangup();
			}
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
			//console.log(data.numofclients);
			
			if (data.numofclients == 1 || data.numofclients == 0)
			{
				isChannelReady = false;
				isStarted = false;
			}
				
			else
			{
				isChannelReady = true;
			}
				
			//console.log(isChannelReady);
				
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
			  console.log.apply(console, array.mes);
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
			if (isStarted)
			{
				hangup();
			}
				
			initiate();
			isInitiator = true;
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
			//initiate();
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
		//sendMessage('Bye');
		sendMessage({
			mes: 'Bye',
			room: currentRoom});
	}
	
	/********************************  WebRTC Now ******************************/
	
	function handleUserMedia(stream)
	{
		localStream = stream;
		attachMediaStream(localVideo, stream);
		sendMessage({
			mes: 'Got User Media',
			room: currentRoom});
		//sendMessage('Got User Media');
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
		//console.log('Maybestart');
		console.log(isChannelReady + ' ' + isStarted + ' ' + isInitiator);
		if (!isStarted && localStream && isChannelReady)
		{
			createPeerConnection();
			pc.addStream(localStream);
			isStarted = true;
			
			if (isInitiator) 
			{
				doCall();
			}
		}
	}
	
	function createPeerConnection()
	{
		//console.log('create peer connection');
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
		pc.onaddstream = handleRemoteStreamAdded;
		pc.onremovestream = handleRemoteStreamRemoved;
	}
	
	function handleIceCandidate(event) 
	{
		//console.log('handle ice candidate');
		//console.log(event.candidate)
		//console.log('handleIceCandidate event: ', event);
		if (event.candidate) 
		{
			sendMessage({
			mes:
			{
				type: 'Candidate',
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate,
			},					
			room: currentRoom});
		}
		else 
		{
		//console.log('End of candidates.');
		}
	}

	function handleRemoteStreamAdded(event) 
	{
		//console.log('Remote stream added.');
		// reattachMediaStream(miniVideo, localVideo);
		attachMediaStream(remoteVideo, event.stream);
		remoteStream = event.stream;
		// waitForRemoteVideo();
	}
	
	function handleRemoteStreamRemoved(event) 
	{
		console.log('Remote stream removed. Event: ', event);
	}
	
	function doCall()
	{
		//console.log('docall');
		var constraints = {'optional': [], 'mandatory': {'MozDontOfferDataChannel': true}};
		if (webrtcDetectedBrowser === 'chrome')
		{
			for (var prop in constraints.mandatory)
			{
				if (prop.indexOf('Moz') !== -1)
				{
					delete constraints.mandatory[prop];
				}
			}
		}		
		constraints = mergeConstraints(constraints, sdpConstraints);
		console.log('Sending offer to peer, with constraints: \n' +
			    '  \'' + JSON.stringify(constraints) + '\'.');
		pc.createOffer(setLocalAndSendMessage, null, constraints);		
	}
	
	function doAnswer() 
	{
		//console.log('doanswer');
		pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
	}
	

	function hangup() 
	{
		//console.log("hangUp");
		stop();
		sendMessage({
			mes: 'Bye',
			room: currentRoom});
	}

	function handleRemoteHangup() 
	{
		//console.log('handleRemoteHangup');
		stop();
		//isInitiator = false;
	}

	function stop() 
	{
		//console.log("stop");
		isStarted = false;
		// isAudioMuted = false;
		// isVideoMuted = false;
		pc.close();
		pc = null;
	}
	
	function mergeConstraints(cons1, cons2) 
	{
		//console.log('merge');
		var merged = cons1;
		for (var name in cons2.mandatory) 
		{
			merged.mandatory[name] = cons2.mandatory[name];
		}
		merged.optional.concat(cons2.optional);
		return merged;
	}
	
	function setLocalAndSendMessage(sessionDescription) 
	{
		//console.log('setlocalsendmessage');
		// Set Opus as the preferred codec in SDP if Opus is present.
		sessionDescription.sdp = preferOpus(sessionDescription.sdp);
		pc.setLocalDescription(sessionDescription);
		sendMessage({
			mes: sessionDescription,
			room: currentRoom});
	}
	
	

	function preferOpus(sdp) 
	{
		//console.log('preferopus');
		var sdpLines = sdp.split('\r\n');
		var mLineIndex;
		// Search for m line.
		for ( var i = 0; i < sdpLines.length; i++) 
		{
			if (sdpLines[i].search('m=audio') !== -1) 
			{
				mLineIndex = i;
				break;
			}
		}
		if (mLineIndex === null) 
		{
			return sdp;
		}

		// If Opus is available, set it as the default in m line.
		for (i = 0; i < sdpLines.length; i++) 
		{
			if (sdpLines[i].search('opus/48000') !== -1) 
			{
				var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
				if (opusPayload) 
				{
					sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
				}
				break;
			}
		}

		// Remove CN in m line and sdp.
		sdpLines = removeCN(sdpLines, mLineIndex)
		sdp = sdpLines.join('\r\n');
		return sdp;
	}

	function extractSdp(sdpLine, pattern) 
	{
		//console.log('extract');
		var result = sdpLine.match(pattern);
		return result && result.length === 2 ? result[1] : null;
	}

	// Set the selected codec to the first in m line.
	function setDefaultCodec(mLine, payload) 
	{
		//console.log('default codec');
		var elements = mLine.split(' ');
		var newLine = [];
		var index = 0;
		for ( var i = 0; i < elements.length; i++) 
		{
			if (index === 3) { // Format of media starts from the fourth.
				newLine[index++] = payload; // Put target payload to the first.
			}
			if (elements[i] !== payload) 
			{
				newLine[index++] = elements[i];
			}
		}
		return newLine.join(' ');
	}

	// Strip CN from sdp before CN constraints is ready.
	function removeCN(sdpLines, mLineIndex) 
	{
		//console.log('removecn');
		var mLineElements = sdpLines[mLineIndex].split(' ');
		// Scan from end for the convenience of removing an item.
		for ( var i = sdpLines.length - 1; i >= 0; i--) 
		{
			var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
			if (payload) 
			{
				var cnPos = mLineElements.indexOf(payload);
				if (cnPos !== -1) 
				{
					// Remove CN payload from m line.
					mLineElements.splice(cnPos, 1);
				}
				// Remove CN line in sdp
				sdpLines.splice(i, 1);
			}
		}

		sdpLines[mLineIndex] = mLineElements.join(' ');
		return sdpLines;
	}
	

})(jQuery);