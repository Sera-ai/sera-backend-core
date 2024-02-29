const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const mongoString = process.env.DB_HOST;
const bodyParser = require('body-parser');
const manageRoutes = require('./src/routes/routes.manage');
const endpointRoutes = require('./src/routes/routes.endpoint');

mongoose.connect(`${mongoString}/Sera`, { useNewUrlParser: true, useUnifiedTopology: true });
const database = mongoose.connection;

database.on('error', (error) => {
    console.log(error); process.exit();
})
database.once('connected', () => {
    console.log('Database Connected');
    const app = express();
    const http = require('http');
    const server = http.createServer(app);

    app.use(cors(), express.json(), bodyParser.urlencoded({ extended: true }), bodyParser.json());
    app.use('/manage', manageRoutes)
    app.use('/manage/endpoint', endpointRoutes)

    server.listen(process.env.BE_BUILDER_PORT, () => {
        console.log(`Builder Started at ${process.env.BE_BUILDER_PORT}`)
    })

})