const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const log4js = require('log4js');

const indexRouter = require('./routes/index');
const graphRouter = require('./routes/graph');

const app = express();

const whitelistOrigins = [
    'https://lnlighthouse.online',
    'http://127.0.0.1:8080'
];

app.use(function(req, res, next) {
    const origin = req.headers.origin;
    if (whitelistOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin); // update to match the domain you will make the request from
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(log4js.connectLogger(log4js.getLogger("http"), { level: 'auto' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/graph', graphRouter);

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500).send('Error: Check HTTP status code');
});

module.exports = app;