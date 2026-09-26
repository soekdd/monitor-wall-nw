var fs = require('fs');
var csvData = fs.readFileSync('control.csv', 'utf8').split("\n");
var data = [];
csvData.forEach(function(line){
    var elements = line.split(';');
    data.push({'priority':elements[0],'type':elements[1],'seasons':elements[2],'group':elements[3],'file':elements[5],'title':elements[6]});
});
fs.writeFileSync('fotos.js','fotos = '+JSON.stringify(data));
