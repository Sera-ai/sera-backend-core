const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const mongoString = process.env.DB_HOST;
const bodyParser = require('body-parser');
const manageRoutes = require('./routes/routes.manage');

mongoose.connect(mongoString, { dbName: "Sera" });
const database = mongoose.connection;

database.on('error', (error) => { console.log(error) })
database.once('connected', () => { console.log('Database Connected'); })

const app = express();
const http = require('http');
const server = http.createServer(app);

app.use(cors(), express.json(), bodyParser.urlencoded({ extended: true }), bodyParser.json());
app.use('/manage', manageRoutes)

server.listen(process.env.BE_BUILDER_PORT, () => {
    console.log(`Builder Started at ${process.env.BE_BUILDER_PORT}`)
})