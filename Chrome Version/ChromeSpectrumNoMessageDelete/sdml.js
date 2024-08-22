let db;
let request = indexedDB.open("SpectrumChatLogs", 2);
let intervalTimer = setInterval(function () {
    console.log("Beginning Observer Timer");
    startObservingChat();
}, 500);

request.onupgradeneeded = function (event) {
    db = event.target.result;
    db.createObjectStore("general", { keyPath: "id" });
    db.createObjectStore("sc-testing-chat", { keyPath: "id" });
};

request.onsuccess = function (event) {
    db = event.target.result;
    console.log("Database Created");
};

request.onerror = function (event) {
    console.error("Database error:", event.target.errorCode);
};

function storeMessage(channel, messageId, content, sender) {
    const transaction = db.transaction([channel], "readwrite");
    const store = transaction.objectStore(channel);
    store.put({ id: messageId, content: content, sender: sender });
    transaction.oncomplete = function () {
        //console.log(`Message with ID ${messageId} stored successfully in ${channel} channel.`);
    };
    transaction.onerror = function (event) {
        console.error("Error storing message:", event.target.errorCode);
    };
}

function getMessage(channel, messageId, callback) {
    const transaction = db.transaction([channel], "readonly");
    const store = transaction.objectStore(channel);
    const request = store.get(messageId);

    request.onsuccess = function (event) {
        const result = event.target.result;
        if (result) {
            callback(result.content, result.sender);
        } else {
            //console.log(`Message with ID ${messageId} not found in ${channel} channel.`);
            callback(null, null); // Call the callback with null content and null sender if the message is not found
        }
    };

    request.onerror = function (event) {
        console.error("Error retrieving message:", event.target.errorCode);
        callback(null, null); // Call the callback with null content and null sender in case of error
    };
}

function getMessageDetails(messageElement) {
    const messageId = messageElement.getAttribute('data-message-id');
    const contentElement = messageElement.querySelector('.content .bottom .body > div');
    const messageContent = contentElement ? contentElement.textContent.trim() : '';
    const nicknameElement = messageElement.querySelector(".nickname");
    const messageSender = nicknameElement ? nicknameElement.textContent.trim() : '';
    return { id: messageId, content: messageContent, sender: messageSender };
}

function createOriginalMessage(originalMessage, sender, node) {
    const originalMessageDiv = document.createElement("div");
    originalMessageDiv.innerText = `Original Message By ${sender}: ${originalMessage}`;
    node.appendChild(originalMessageDiv);
}

function handleContentChange(mutationsList) {
    for (let mutation of mutationsList) {
        if (mutation.type !== 'childList') {
            continue;
        }

        for (let node of mutation.addedNodes) {
            if (!node.classList.contains("body-erased")) {
                continue;
            }

            if (node.innerText.includes("[Deleted by")) {
                const messageElement = node.closest('.message-item');
                if (messageElement) {
                    const messageId = messageElement.getAttribute('data-message-id');
                    const channel = determineChannel();
                    if (channel) {
                        getMessage(channel, messageId, function (originalMessage, sender) {
                            if (originalMessage) {
                                createOriginalMessage(originalMessage, sender, node.parentElement);
                            }
                        });
                    }
                }
            }
        }
    }
}

function processMessage(messageElement) {
    const { id, content, sender } = getMessageDetails(messageElement);
    const channel = determineChannel();

    // If it is a deleted message then replace with content that might be stored. Either way, cancels storing and observing if deleted
    const deletedElement = messageElement.querySelector(".content .bottom .body .body-erased");
    if (deletedElement) {
        getMessage(channel, id, function(originalMessage, sender) {
            if (originalMessage) {
                const location = messageElement.querySelector(".content .bottom .body");
                if (location) {
                    createOriginalMessage(originalMessage, sender, location);
                }
            }
        });
        return;
    }

    if (channel) {
        storeMessage(channel, id, content, sender);
    }

    const contentElement = messageElement.querySelector('.content .bottom .body');
    if (contentElement) {
        const observer = new MutationObserver(handleContentChange);
        observer.observe(contentElement, {
            childList: true,
            characterData: true,
            subtree: true,
            characterDataOldValue: true
        });
    }
}

function startObservingChat() {
    const chatContainer = document.querySelector('.messages-list');

    if (chatContainer) {
        console.log("Starting Chat Listener")
        clearInterval(intervalTimer);
        
        // Process existing messages
        const existingMessages = chatContainer.querySelectorAll('.message-item');
        existingMessages.forEach(processMessage);

        // Set up an observer for new messages
        const observer = new MutationObserver(function (mutationsList) {
            mutationsList.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.matches('.message-item')) {
                            processMessage(node);
                        }
                    });
                }
            });
        });

        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
    }
}


function determineChannel() {
    const currentUrl = window.location.href;
    if (currentUrl.includes("lobby/1")) {
        return "general";
    } else if (currentUrl.includes("lobby/38230")) {
        return "sc-testing-chat";
    }
    return null;
}

function downloadChatLog() {
    const channels = ["general", "sc-testing-chat", "shit-cig-says"];
    let logs = {};
    channels.forEach(channel => {
        const transaction = db.transaction([channel], "readonly");
        const store = transaction.objectStore(channel);
        const request = store.getAll();
        request.onsuccess = function (event) {
            const messages = event.target.result.map(msg => ({
                id: msg.id,
                content: msg.content
            }));
            logs[channel] = messages;
            if (Object.keys(logs).length === channels.length) {
                createDownloadFile(logs);
            }
        };
        request.onerror = function (event) {
            console.error("Error retrieving messages:", event.target.errorCode);
        };
    });
}

function createDownloadFile(logs) {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-log.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}



window.addEventListener('load', startObservingChat);
