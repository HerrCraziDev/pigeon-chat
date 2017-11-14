const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
//const regex = re
var io = require('socket.io') (http);
var encode = require('ent/encode');
var markdown = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true
});

const mimeType = {
   '.ico': 'image/x-icon',
   '.html': 'text/html',
   '.js': 'text/javascript',
   '.json': 'application/json',
   '.css': 'text/css',
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.wav': 'audio/wav',
   '.mp3': 'audio/mpeg',
   '.ogg': 'audio/ogg',
   '.svg': 'image/svg+xml',
   '.pdf': 'application/pdf',
   '.doc': 'application/msword',
   '.eot': 'appliaction/vnd.ms-fontobject',
   '.ttf': 'application/font-sfnt'
};

//Déprécié
var usersList = [];
var godExists = 0; //Bool indiquant si l'administrateur suprême est là

//Constantes
const maxPseudoLength = 42;
const maxMsgLength = 2000;

//Retourne le type MIME correspondant au fichier
var getMime = function (pathname)
{
    return mimeType[path.parse(pathname).ext];
}

//Crée le contenu du message, incluant les widgets et la mise en forme
var makeMessage = function (pseudo, msg)
{
    var date = new Date();
    var hour = date.toLocaleString();

    return '<div class="message"><h3 class="username connected">' + pseudo + '</h3> <span class="timestamp">' + hour + '</span>\n' + markdown.render(encode(msg)) + '</div>';
}

//Ajoute un utilisateur
var addUser = function (socket, pseudo, status)
{
    //Pseudo (caractéres alphanumériques uniquement)
    socket.pseudo = pseudo;
    socket.status = status;    //Statuts : connected, admin, modo, afk, absent
    socket.role = ['user'];


    for (var i in usersList)
    {
        if ( usersList[i].pseudo == socket.pseudo ) return 'already_exists';
    }

    if ( (socket.pseudo.indexOf('<') == -1) && (socket.pseudo.indexOf('>') == -1) && socket.pseudo.length > 1 && socket.pseudo.length < maxPseudoLength)
    {
        usersList.push( {pseudo:socket.pseudo, id:socket.id, status:socket.status, connDate:'not_impl', lastMsg:'not_impl', roles: socket.role } );
        return 'ok';
    } else {
        return 'bad_name';
    }
}

var findUser = function(username)
{
    for (var i in usersList)
    {
        if (usersList[i].pseudo == username) return i;
    }

    return -1;
}

//Retire un utilisateur
var removeUser = function (userID)
{
    for ( var i in usersList )
    {
        if (userID === usersList[i].id) delete usersList[i];
    }
}

var banUser = function (username, reason)
{
    var i = findUser(username);

    if (i != -1)
    {
        var user = usersList[i].usersocket
        user.emit('server-msg', 'Vous avez été banni pour ' + reason);
        user.broadcast.emit('server-msg', username + ' a été banni pour ' + reason);
        user.disconnect(true);
    }
}

var exec = function (socket, command)
{
    var params = command.split(' ');

    console.log(socket.pseudo+' : '+command);

    switch (params[0])
    {
        case '/ban':
            var reason = '';
            for (var i = 2 ; i < params.length ; i++) {
                reason += params[i];
            }
            reason = (reason == '') ? 'raison non spécifiée' : reason;

            banUser(params[1]);
            break;
        case '/say':
            if (socket.status == 'admin')
            {
                io.emit('server-msg', command.replace('/say ', ''));
            } else {
                socket.emit('server-error', "Vous n'avez pas les droits requis pour exécuter cette commande");
            }
            break;
        case '/mp':
            socket.emit('server-msg', "Cette commande n'est pas encore implémentée parce que le Grand Chef n'a pas encore trouvé l'incantation appropriée");
            break;
        default:
            console.log('Unknown command "'+command+'"');
    }
}


//creaytt da servr
const server = http.createServer( (req, resp) => {
    //console.log(req.headers['host']);
    var params = url.parse(req.url).query;

    if ( req.headers['host'].substring(0,3) == 'adm' )
    {
        var path = "/var/www/adm" + url.parse(req.url).pathname;
    } else {
        var path = "/var/www/html" + url.parse(req.url).pathname;
    }

    //If the file is not specified, check the index.html
    /*if ( fs.statSync(path).isDirectory() )
    {
        path += '/index.html';
    }*/

    //Reads the file and builds the correct response
    fs.readFile( path, (err, data) => {
        if (err)
        {
            switch (err.code)
            {
            case 'ENOENT':
                resp.writeHead( 404, { "Content-Type" : "text/plain" } );

                resp.write("NJS NUI [Beta] Error. 404 Not Found\n"+path+" was not found on this server.");
                console.log("Error 404 : "+path+" not found.");
                break;

            case 'EISDIR':
                resp.writeHead( 403, { "Content-Type" : "text/plain" } );

                resp.write("NJS NUI [Beta] Error. 403 Forbidden\nYou have not access to this file.\nCause : (EISDIR) This is a directory and auto-indexing is disabled.")
                break;

            default:
                resp.writeHead( 500, { "Content-Type" : "text/plain" } );

                resp.write("NJS NUI [Beta] Error. 500 Internal Error\nCode : "+err.code);
            }
        } else {
            resp.writeHead( 200, { "Content-Type" : getMime(path) } );
            resp.write(data);
        }

        resp.end();
    });

});



io.listen(server);
console.log("Started socket.io");

//var general = io.of('/general');

io.on('connection', (socket, pseudo) => {
    console.log('New client connected, waiting for auth. probe');

    //socket.emit('auth');

    socket.on('auth', (pseudo) => {

        var error = addUser(socket, pseudo, 'user');

        if (error == 'ok')
        {
              socket.emit('server-msg', 'Coucou, '+pseudo+' ! Content de vous voir !\n');
              socket.broadcast.emit('server-msg', 'Hey ! '+pseudo+' a glissé dans le serveur !\n');

              io.emit('user', usersList);

              console.log('### User '+socket.pseudo+' authentified ! ###');

        } else {
              socket.emit('auth','denied', error);
              console.log("Denied "+socket.pseudo+', cause : '+error);
        }

    });

    socket.join('public'); //Par défaut connecté au salon public de la catégorie General.

    socket.on('message', (message) => {
        console.log(socket.pseudo + ' : ' + encode(message));
        if ( message.length > 0 && message.length < maxMsgLength && findUser(socket.pseudo) != -1 ) //Vérifier le contenu du message et l'authentification de l'utilisateur
        {
            if ( message.indexOf('/') == 0 ) //Est ce une commande?
            {
                exec(socket, message);
            } else {
                /*if ( (message.indexOf('<') == -1) && (message.indexOf('>') == -1) ) //Anti HTML, utiliser le markdown
                {
                    io.emit('message', makeMessage(socket.pseudo, message));
                } else {
                    io.emit('message', makeMessage(socket.pseudo, "Ce message a été bloqué car son envoyeur est un méchant troll :("));
                }*/
                io.emit('message', makeMessage(socket.pseudo, message));
            }
        }
    });

    socket.on('god-auth', (pseudo, hash) => {


        var godhash = fs.readFileSync('/var/www/adm/chat/god.pwd');

        if ( godhash.indexOf(hash) != -1 && !godExists )
        {
            //Ajout de l'utilisateur
            var error = addUser(socket, pseudo, 'admin');

            if (error == 'ok')
            {
                  socket.emit('server-msg', 'Maître '+pseudo+', bonjour ! Ces manants sont entre vos mains.\n');
                  socket.broadcast.emit('server-msg', 'Attention ! Le hendek '+pseudo+' arrive !\n');

                  io.emit('user', usersList);

                  console.log('### User '+socket.pseudo+' authentified ! ###');

            } else {
                  socket.emit('auth','denied', error);
                  console.log("Denied "+socket.pseudo+', cause : '+error);
            }

            //Permissions d'administration
            socket.role.push('god');
            socket.role.push('admin');

            godExists = true;
            console.log('### God connected ###');

            socket.emit('auth', 'ok');//Pas utilisé

            socket.on('disconnect', (reason) => {
                godExists = 0;
            });

        } else {
            console.log('Failed to authentify a superadmin.');
            socket.emit('auth', 'denied', 'bad_auth');
            //socket.disconnect(true);
        }
    });

    socket.on('disconnecting', (reason) => {
        console.log(socket.pseudo + ' has disconnected.');
        io.emit('server-msg', socket.pseudo + " s'en est allé vers d'autres horizons...");

        removeUser(socket.id);

        io.emit('user', usersList);
    });
});




server.listen(8080);
console.log('Server running on port 8080');
