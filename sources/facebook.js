(function() {
	function pushMessage(data) {
		try {
			chrome.runtime.sendMessage(chrome.runtime.id, {
				"message": data
			}, function(e) {});
		} catch (e) {}
	}

	function toDataURL(url, callback) {
	  var xhr = new XMLHttpRequest();
	  xhr.onload = function() {
		  
		var blob = xhr.response;
    
		if (blob.size > (55 * 1024)) {
		  callback(url); // Image size is larger than 25kb.
		  return;
		}

		var reader = new FileReader();
		
		
		reader.onloadend = function() {
		  callback(reader.result);
		}
		reader.readAsDataURL(xhr.response);
	  };
	  xhr.open('GET', url);
	  xhr.responseType = 'blob';
	  xhr.send();
	}
	
	function escapeHtml(unsafe){
		try {
			if (settings.textonlymode){ // we can escape things later, as needed instead I guess.
				return unsafe;
			}
			return unsafe
				 .replace(/&/g, "&amp;")
				 .replace(/</g, "&lt;")
				 .replace(/>/g, "&gt;")
				 .replace(/"/g, "&quot;")
				 .replace(/'/g, "&#039;") || "";
		} catch(e){
			return "";
		}
	}

	function isEmoji(char) {
		const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
		return emojiRegex.test(char);
	}
	
	function getAllContentNodes(element, textonly=false) { // takes an element.
		var resp = "";
		
		if (!element){return resp;}
		
		if (!element.childNodes || !element.childNodes.length){
			if (element.textContent){
				return escapeHtml(element.textContent) || "";
			} else {
				return "";
			}
		}
		
		if (element.ariaLabel){return "";} // this implies we're on the wrong path.
		
		if (element.skip){return "";}
		
		
		element.childNodes.forEach(node=>{
			if (node.childNodes.length){
				resp += getAllContentNodes(node, textonly)
			} else if ((node.nodeType === 3) && node.textContent && (node.textContent.trim().length > 0)){
				resp += escapeHtml(node.textContent);
			} else if (node.nodeType === 1){
				node.skip = true; // facebook specific need
				if (!settings.textonlymode && !textonly){
					if ((node.nodeName == "IMG") && node.src){
						node.src = node.src+"";
					}
					resp += node.outerHTML;
				} else if (node.nodeName == "IMG"){
					if (node.alt && isEmoji(node.alt)){
						resp += escapeHtml(node.alt);
					}
				}
			}
		});
		return resp;
	}
	
	var dupCheck2 = [];
	
	function sleep(ms) {
	  return new Promise(resolve => setTimeout(resolve, ms));
	}


	async function processMessage(ele) {
		if (ele == window) {
			return;
		}
		
		var chatimg = "";
		try {
			var imgele = ele.childNodes[0].querySelector("image");//.href.baseVal; // xlink:href
			imgele.skip = true;
			chatimg = imgele.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
		} catch(e){
			//console.log(e);
		}
		
		if (!chatimg){ // give this image time to load in, and cancel if the message is removed due to react.
			await sleep(50);
			if (!ele.isConnected){return;}
			await sleep(50);
			if (!ele.isConnected){return;}
			await sleep(50);
			if (!ele.isConnected){return;}
			await sleep(50);
			if (!ele.isConnected){return;}
		}
		
		var name = "";
		try {
			var nameElement = ele.childNodes[1].childNodes[0].querySelectorAll('span[dir="auto"]')[0];
			nameElement.skip = true;
			name = escapeHtml(nameElement.innerText);
			
		} catch (e) {
			try {
				name = escapeHtml(ele.childNodes[1].childNodes[0].querySelector('a[role="link"]').innerText);
			} catch (e) {
				return;
			}
		}

		
		var test = ele.querySelectorAll("div[dir='auto'] > div[role='button'][tabindex='0']")
		if (test.length ===1){
			test[0].click();
			await new Promise(r => setTimeout(r, 100));
		}

		var msg = "";
		
		var msgElement = "";
		
		try {
			msgElement = ele.childNodes[1].childNodes[0].querySelectorAll('span[dir="auto"]');
			msgElement = msgElement[msgElement.length -1];
			msg = getAllContentNodes(msgElement);
		} catch(e){}


		if (!msg){
			if (!settings.textonlymode){
				try {
					msgElement = ele.querySelector("ul > li").parentNode.parentNode;
					msgElement.skip = true;
					if (msgElement.nextSibling){msgElement.nextSibling.skip = true;}
					msg = getAllContentNodes(msgElement.parentNode);
				}catch(e){}
			}
		}
		
		if (msg) {
			msg = msg.trim();
			if (name) {
				if (msg.startsWith(name)) {
					msg = msg.replace(name, '');
					msg = msg.trim();
				}
			}
		}
		
		var dupMessage = msg; // I dont want to include original replies in the dup check; just the message.
		
		try {
			if (settings.replyingto && msg && ele.previousSibling) {
				try {
					//console.log(ele);
					var replyMessage = getAllContentNodes(ele.previousSibling.querySelector("div>div>span>span"), true);
					if (replyMessage) {
						if (settings.textonlymode) {
							msg = replyMessage + ": " + msg;
						} else {
							msg = "<i><small>" + replyMessage + ":&nbsp;</small></i> " + msg;
						}
					}
				} catch (e) {
					//console.error(e);
				}
			}
		} catch (e) {}
		
		var contentimg = "";
		if (!msg){
			try {
				contentimg = ele.querySelector('div>div>div>div>div>div>div>img[draggable="false"][width][height][class][src]').src;
				//msg = "<img src='"+msg+"' />";
			} catch(e){
				return;
			}
		}
		
		if (!msg && !contentimg){return;}

		var badges = [];	// we do badges last, as we have already marked images as used in the msg step, so less likely of confusing baddges with images
		try {
			ele.childNodes[1].childNodes[0].querySelectorAll('div[aria-label] img[src][alt]').forEach(img=>{
				if (img.skip){return;}
				if (msgElement.contains(img)){return;} // just in case skip fails
				if (!img.src.startsWith("data:image/svg+xml,")){
					badges.push(img.src);
					img.skip = true;
				}
			});
		} catch (e) {
		}

		var data = {};
		data.chatname = name;
		data.chatbadges = badges;
		data.backgroundColor = "";
		data.textColor = "";
		data.chatmessage = msg;
		data.chatimg = chatimg;
		data.hasDonation = "";
		data.membership = "";;
		data.contentimg = contentimg;
		data.textonly = settings.textonlymode || false;
		
		if (window.location.href.includes("workplace.com")){
			data.type = "workplace";
		} else {
			data.type = "facebook";
		}
		
		
		var entry = data.chatname + "+" + data.hasDonation + "+" + dupMessage;
		var entryString = JSON.stringify(entry);

		if (!dupCheck2.includes(entryString)) {
			dupCheck2.push(entryString);
			
			setTimeout(() => {
				const index = dupCheck2.indexOf(entryString);
				if (index > -1) {
					dupCheck2.splice(index, 1);
				}
			}, 15000);

			//console.log(data);
		} else {
			return;
		}
	//	console.log([...dupCheck2]);
		
		//console.warn(data);
		pushMessage(data);
	}
	
	var settings = {};
	// settings.textonlymode
	// settings.captureevents
	
	chrome.runtime.sendMessage(chrome.runtime.id, { "getSettings": true }, function(response){  // {"state":isExtensionOn,"streamID":channel, "settings":settings}
		if ("settings" in response){
			settings = response.settings;
		}
	});

	chrome.runtime.onMessage.addListener(
		function(request, sender, sendResponse) {
			try {
				if ("focusChat" == request) {
					
					if (document.querySelectorAll('div[role="textbox"][contenteditable="true"] p').length){
						var eles = document.querySelectorAll('div[role="textbox"][contenteditable="true"] > p');
					} else {
						var eles = document.querySelectorAll('div[contenteditable="true"] div[data-editor]>div[data-offset-key]');
					}
					if (eles.length) {
						var i = eles.length-1;
						while (i>=0){
							try {
								eles[i].focus();
								eles[i].focus();
								eles[i].click();
								eles[i].focus();
								break;
							} catch (e) {}
							i--;
						}
					} else if (document.querySelector('div.notranslate[contenteditable="true"] > p')){
						document.querySelector('div.notranslate[contenteditable="true"] > p').focus();
						document.querySelector('div.notranslate[contenteditable="true"] > p').focus();
						document.querySelector('div.notranslate[contenteditable="true"] > p').click();
						document.querySelector('div.notranslate[contenteditable="true"] > p').focus();
					} else if (document.querySelector("div[data-editor]>[data-offset-key]")) {
						document.querySelector("div[data-editor]>[data-offset-key]").focus();
						document.querySelector("div[data-editor]>[data-offset-key]").focus();
						document.querySelector("div[data-editor]>[data-offset-key]").click();
						document.querySelector("div[data-editor]>[data-offset-key]").focus();
					} else {
						sendResponse(true);
						return;
					}
					sendResponse(true);
					return;
				}
				if (typeof request === "object"){
					if ("settings" in request){
						settings = request.settings;
						sendResponse(true);
						return;
					}
				}
			} catch (e) {}

			sendResponse(false);
		}
	);

	var dupCheck = [];
	
	
	var lastURL = "";
	var processed = 0;
	
	console.log("LOADED SocialStream EXTENSION");
	
	var eles = document.querySelectorAll('div[contenteditable="true"] div[data-editor]>div[data-offset-key]');
	if (eles.length) {
		var i = eles.length-1;
		while (i>=0){
			try {
				eles[i].focus();
			} catch (e) {}
			i--;
		}
	} 

	var ttt = setInterval(function() {
		dupCheck = dupCheck.slice(-60); // facebook seems to keep around 40 messages, so this is overkill?
		
		if (lastURL !== window.location.href){
			lastURL = window.location.href;
			processed = 0;
		}  else {
			processed += 1;
		}
		try {
			if (window.location.href.includes("/live/producer/") || window.location.href.includes("/videos/")) {
				var main = document.querySelectorAll("[role='article']");
				for (var j = 0; j < main.length; j++) {
					try {
						if (!main[j].dataset.set123) {
							main[j].dataset.set123 = "true";
							if (main[j].id){
								if (main[j].id.startsWith("client:")) {
									continue;
								}
								if (dupCheck.includes(main[j].id)) {
									continue;
								}
								dupCheck.push(main[j].id);
								if (processed>3){
									processMessage(main[j]);
								}
							} else if (main[j].parentNode && main[j].parentNode.id) {
								if (dupCheck.includes(main[j].parentNode.id)){
									continue;
								}
								if (main[j].parentNode.id.startsWith("client:")) {
									continue;
								}
								dupCheck.push(main[j].parentNode.id);
								if (processed>3){
									processMessage(main[j]);
								}
							} else if (main[j].parentNode && !main[j].id && !main[j].parentNode.id) {
								var id = main[j].querySelector("[id]"); // an archived video
								if (id && !(dupCheck.includes(id))) {
									dupCheck.push(id);
									if (processed>3){
										processMessage(main[j]);
									}
								}
							}
						}
					} catch (e) {}
				}
			}
		} catch (e) {console.error(e);}
	}, 800);
	
	///////// the following is a loopback webrtc trick to get chrome to not throttle this twitch tab when not visible.
	try {
		var receiveChannelCallback = function(e) {
			remoteConnection.datachannel = event.channel;
			remoteConnection.datachannel.onmessage = function(e) {};;
			remoteConnection.datachannel.onopen = function(e) {};;
			remoteConnection.datachannel.onclose = function(e) {};;
			setInterval(function() {
				if (document.hidden) { // only poke ourselves if tab is hidden, to reduce cpu a tiny bit.
					remoteConnection.datachannel.send("KEEPALIVE")
				}
			}, 800);
		}
		var errorHandle = function(e) {}
		var localConnection = new RTCPeerConnection();
		var remoteConnection = new RTCPeerConnection();
		localConnection.onicecandidate = (e) => !e.candidate || remoteConnection.addIceCandidate(e.candidate).catch(errorHandle);
		remoteConnection.onicecandidate = (e) => !e.candidate || localConnection.addIceCandidate(e.candidate).catch(errorHandle);
		remoteConnection.ondatachannel = receiveChannelCallback;
		localConnection.sendChannel = localConnection.createDataChannel("sendChannel");
		localConnection.sendChannel.onopen = function(e) {
			localConnection.sendChannel.send("CONNECTED");
		};
		localConnection.sendChannel.onclose = function(e) {};
		localConnection.sendChannel.onmessage = function(e) {};
		localConnection.createOffer()
			.then((offer) => localConnection.setLocalDescription(offer))
			.then(() => remoteConnection.setRemoteDescription(localConnection.localDescription))
			.then(() => remoteConnection.createAnswer())
			.then((answer) => remoteConnection.setLocalDescription(answer))
			.then(() => {
				localConnection.setRemoteDescription(remoteConnection.localDescription);
				console.log("KEEP ALIVE TRICk ENABLED");
			})
			.catch(errorHandle);
	} catch (e) {
		console.log(e);
	}


})();