// socket.js
import { useState } from "react";
import { io } from "socket.io-client";
import { socketData } from "../../Store";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const Socket = () => {
    const { socketConnection, setSocketConnection } = socketData();

    // console.log(socketConnection);
    // const [socketConnection, setSocketConnection] = useState(null);

    const connect_socket = () => {

        return new Promise((resolve, reject) => {
            if (!socketConnection) {
                // Only initialize the socket if it hasn't been initialized yet
                let connection = io(SOCKET_URL, {
                    transports: ['websocket'],
                    path: "/socket.io/"
                });
                setSocketConnection(connection);
                resolve(connection);
            } else {
                resolve(socketConnection);
            }
        });
    }
    const disconnect_socket = () => {
        socketConnection.disconnect();
        setSocketConnection(null);
        // console.log("Socket disconnected");
    }
    return { connect_socket, disconnect_socket };

}


export default Socket;
