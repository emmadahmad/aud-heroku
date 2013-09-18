var audio = document.getElementById('audioPlayer'),
	record = document.getElementById('record'),
	stop = document.getElementById('stop'),
	play = document.getElementById('play'),
	time = document.getElementById('time'),
	audioConstraints = { audio: true, video: false};

$(audio).hide();
$(time).hide();

if (webrtcDetectedBrowser == 'chrome')
{
	$(audio).show();
	$(time).hide();
}
else
{
	$(audio).hide();
	$(time).show();
}

	
stop.disabled = true;
play.disabled = true;
record.disabled = false;
	
var audioStream,
	recorder,
	audioLink = '';

record.onclick = function() 
{
	if (webrtcDetectedBrowser == 'chrome')
    {
	    if (!audioStream)
	        navigator.getUserMedia(audioConstraints, function(stream) 
	        {
	            if (window.IsChrome) stream = new window.MediaStream(stream.getAudioTracks());
	            audioStream = stream;
	
	            audio.src = URL.createObjectURL(audioStream);
	            audio.play();
	            audio.muted = true;
	
	            // "audio" is a default type
	            recorder = window.RecordRTC(stream, {
	                type: 'audio'
	            });
	            recorder.startRecording();
	        }, function() 
	        { });
	    else 
	    {
	        audio.src = URL.createObjectURL(audioStream);
	        audio.play();
	        if (recorder) recorder.startRecording();
	    }
    }
    else
    {
		Recorder.record({
		  start: function(){
		    //alert("recording starts now. press stop when youre done. and then play or upload if you want.");
		  },
		  progress: function(milliseconds){
		    document.getElementById("time").innerHTML = timecode(milliseconds);
		  }
		});
    }

    window.isAudio = false;
    this.disabled = true;
    stop.disabled = false;
    play.disabled = true;
};

stop.onclick = function() 
{
    this.disabled = true;
    record.disabled = false;
    play.disabled = false;
    audio.src = '';
    
    if (webrtcDetectedBrowser == 'chrome')
    {
	    if (recorder)
	    {
	    	recorder.stopRecording(function(url) 
	        {
	        	audioLink = url;
	            document.getElementById('audio-url').innerHTML = '<a href="' + url + '" target="_blank">Download</a>';
	        });
	    }	        
    }
    else
    {
    	Recorder.stop();
    }
};

play.onclick = function()
{
	if (webrtcDetectedBrowser == 'chrome')
	{
		mywindow = window.open();
		mywindow.location.href = audioLink;
		mywindow.focus();
	}
	else
	{
        Recorder.stop();
        Recorder.play({
          progress: function(milliseconds)
          {
            document.getElementById("time").innerHTML = timecode(milliseconds);
          }
        });
	}		
}

function timecode(ms) {
        var hms = {
          h: Math.floor(ms/(60*60*1000)),
          m: Math.floor((ms/60000) % 60),
          s: Math.floor((ms/1000) % 60)
        };
        var tc = []; // Timecode array to be joined with '.'

        if (hms.h > 0) {
          tc.push(hms.h);
        }

        tc.push((hms.m < 10 && hms.h > 0 ? "0" + hms.m : hms.m));
        tc.push((hms.s < 10  ? "0" + hms.s : hms.s));

        return tc.join(':');
      }
