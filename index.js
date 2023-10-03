require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const mongoString = process.env.DATABASE_URL;
const bodyParser = require('body-parser');


const manageRoutes = require('./routes/routes.manage');
const { dynamicRouteHandler } = require('./routes/routes.app');


mongoose.connect(mongoString, { dbName: "Sera" });
const database = mongoose.connection;

database.on('error', (error) => {
    console.log(error)
})

database.once('connected', () => {
    console.log('Database Connected');
})
const app = express();
const middlewareChecker = (req, res, next) => {
    const host = req.headers['host'];
    if (host == process.env.IP) {
        // If the Host header contains 'name', use the manageRoutes middleware
        app.use('/manage', manageRoutes)
    } else {
        // Otherwise, use the router middleware
        app.use('/', dynamicRouteHandler)
    }
    next();
};


const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const modelsBuilder = require('./models/models.builder');
const nodesBuilder = require('./models/models.nodes');
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});



app.use(cors())
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(middlewareChecker);

server.listen(3000, () => {
    console.log(`Server Started at ${3000}`)
    console.log(`Socket server Started at ${3000}`)
})


io.on('connection', (socket) => {
    let builder = null
    socket.send("connect", socket.id)
    socket.on("builderConnect", (builderId) => {
        builder = builderId
        socket.join(builderId)
    })
    socket.on("nodeUpdate", (node) => {
        modelsBuilder.findByIdAndUpdate(builder, { "nodes": node.nodes }).then((e) => { })
        socket.broadcast.to(builder).emit('nodeUpdate', { newNodes: node.newNodes });
    })

    socket.on("nodeCreate", async (node) => {

        //if (node.nodes) modelsBuilder.findByIdAndUpdate(builder, { "nodes": node.nodes }).then((e) => { })


        let fields = {}
        switch (node.newNode.type) {
            case "functionNode": fields["out"] = { "integer": { "type": "integer", "readOnly": true, "example": 1 } }
        }

        let newNode = node.newNode

        const savedData = await new nodesBuilder({ fields }).save()
        newNode.data["node_id"] = savedData._id;
        newNode.data["node_data"] = savedData;

        modelsBuilder.findByIdAndUpdate(builder, { $push: { "nodes": newNode } }, { new: true });

        socket.broadcast.to(builder).emit('nodeCreate', { newNode: newNode });
    })

    socket.on("nodeDelete", (nodes) => {
        nodes.map((node) => {
            console.log(node.id)
            modelsBuilder.findByIdAndUpdate(builder, { $pull: { nodes: { id: node.id } } }).then((e) => { console.log(e) })
        })
        console.log("execute")
        socket.broadcast.to(builder).emit('nodeDelete', nodes);
    })

    socket.on("edgeUpdate", (params) => {
        let edges = params.edges
        let newEdges = params.newEdges
        params.newEdges.map((edge) => {
            if (edge.type == "remove") {
                edges = edges.filter(item => item.id !== edge.id);
            }
        })

        modelsBuilder.findByIdAndUpdate(builder, { "edges": edges }).then((e) => { })
        socket.broadcast.to(builder).emit('edgeUpdate', newEdges);
    })
    socket.on("onConnect", (params) => {
        let edges = params.edges
        console.log("edges", edges)

        edges.push(params.edge)
        modelsBuilder.findByIdAndUpdate(builder, { "edges": edges }).then((e) => { })
        socket.broadcast.to(builder).emit('onConnect', params.edge);
    })
    socket.on("getId", (params) => {
        socket.emit('gotId', socket.id);
    })

    socket.on("updateField", (params) => {
        socket.broadcast.to(builder).emit('updateField', params);
    })

    socket.on("mouseMove", (params) => {
        const data = { id: socket.id, x: params.x, y: params.y, color: params.color }
        socket.broadcast.to(builder).emit('mouseMoved', data);
    })

    socket.on('disconnect', () => {
        socket.broadcast.to(builder).emit('userDisconnected', socket.id);
    });
});