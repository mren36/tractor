var socket = io();

socket.emit("enter");

socket.on("reset", function(state) {
  $("#predraw").hide();
  $("#draws").hide();
  $("#plays").hide();
  $("#postgame").hide();
  $("#drawmsg").show();
  $("#playmsg").hide();
  $("#title").show();
  var names = "";
  for (var i = 0; i < Object.keys(state.players).length; i++) {
    var p = Object.keys(state.players)[i];
    names += state.players[p].name + ", ";
  }
  names = names.substring(0, names.length - 2);
  $("#pgplist").html("players: " + names);
  for (let i = 0; i < resetids.length; i++) $(resetids[i]).html("");
  for (let i = 0; i < 4; i++) $(posmap[i]).css("color", "black");
  $("#pregame").show();
});

socket.on("welcome", function(state) {
  var names = "";
  for (let i = 0; i < Object.keys(state.players).length; i++) {
    var p = Object.keys(state.players)[i];
    names += state.players[p].name + ", ";
  }
  names = names.substring(0, names.length - 2);
  $("#pgplist").html("players: " + names);
});

$("#playbutton").click(function(state) {
  socket.emit("reqjoin", $("#name").val());
});

socket.on("nojoin", function(msg) {
  $("#pgmsg").html(msg);
});

socket.on("nameupdate", function(state) {
  var names = "";
  for (let i = 0; i < Object.keys(state.players).length; i++) {
    var p = Object.keys(state.players)[i];
    names += state.players[p].name + ", ";
  }
  names = names.substring(0, names.length - 2);
  $("#pgplist").html("players: " + names);
  $("#dplist").html("players: " + names);
});

socket.on("startdraw", function(state) {
  $("#pregame").hide();
  $("#title").hide();
  $("#predraw").show();
  $("#drawbutton").hide();
  $("#startbutton").hide();
  $("#dwrap").hide();
  $("#pwrap").hide();
  $("#okwrap").hide();
  if (Object.keys(state.players).length < 4)
    $("#pdmsg").html("waiting for more players");
});

socket.on("readydraw", function(state) {
  if (socket.id == state.host) {
    $("#pdmsg").html("start when ready");
    $("#startbutton").show();
  } else $("#pdmsg").html("waiting for host (" + state.players[state.host].name + ") to start");
});

$("#startbutton").click(function() {
  socket.emit("start");
});

socket.on("loaddraw", function(state) {
  for (let i = 0; i < resetids.length; i++) $(resetids[i]).html("");
  var ind = state.turnorder.indexOf(socket.id);
  $("#botp").html(
    state.players[socket.id].name +
      " [" +
      rankmap[state.players[socket.id].rank] +
      "]"
  );
  $("#rightp").html(
    state.players[state.turnorder[(ind + 1) % 4]].name +
      " [" +
      rankmap[state.players[state.turnorder[(ind + 1) % 4]].rank] +
      "]"
  );
  $("#topp").html(
    state.players[state.turnorder[(ind + 2) % 4]].name +
      " [" +
      rankmap[state.players[state.turnorder[(ind + 2) % 4]].rank] +
      "]"
  );
  $("#leftp").html(
    state.players[state.turnorder[(ind + 3) % 4]].name +
      " [" +
      rankmap[state.players[state.turnorder[(ind + 3) % 4]].rank] +
      "]"
  );
  $("#botc").html(display(state.players[socket.id].play));
  $("#rightc").html(
    display(state.players[state.turnorder[(ind + 1) % 4]].play)
  );
  $("#topc").html(display(state.players[state.turnorder[(ind + 2) % 4]].play));
  $("#leftc").html(display(state.players[state.turnorder[(ind + 3) % 4]].play));
  $("#rmsg").html("nothing declared");
  $("#drawbutton").hide();
  $("#postgame").hide();
  $("#predraw").hide();
  $("#bagbutton").hide();
  $("#drawmsg").show();
  $("#playmsg").hide();
  $("#dwrap").hide();
  $("#draws").show();
  if (state.redraw) $("#centerc").html("redrawing");
});

socket.on("nextdraw", function(state) {
  var ind = state.turnorder.indexOf(socket.id);
  if (state.drawn < 100) {
    if (ind == state.turn) {
      $("#dturn").html("it is your turn");
      $("#drawbutton").show();
    } else {
      $("#dturn").html(
        "it is " + state.players[state.turnorder[state.turn]].name + "'s turn"
      );
      $("#drawbutton").hide();
    }
    $(posmap[(state.turn + 4 - ind) % 4]).css("color", "blue");
  } else {
    $("#dturn").html("drawing done");
    $("#drawbutton").hide();
  }
  $(posmap[(state.turn + 7 - ind) % 4]).css("color", "black");
  declaring(state, socket.id);
});

socket.on("declaration", function(state) {
  $("#centerc").html("");
  declaring(state, socket.id);
});

$("#drawbutton").click(function() {
  socket.emit("reqdraw");
});

socket.on("drawdone", function(state) {
  var ind = state.turnorder.indexOf(socket.id);
  var dind = state.turnorder.indexOf(state.dealer);
  var offset = (dind + 4 - ind) % 4;
  $("#rbuts").html("declaring done");
  if (socket.id == state.dealer) {
    $("#rmsg").html(
      "you are the dealer in " +
        rankmap[state.rank] +
        ", " +
        trumpmap[state.trump]
    );
    $("#bagbutton").show();
  } else $("#rmsg").html(state.players[state.dealer].name + " is the dealer in " + rankmap[state.rank] + ", " + trumpmap[state.trump]);
  $(posmap[offset]).css("color", "blue");
  if (state.install)
    $("#centerc").html("bottom draw: " + display(state.stalled[0]));
});

$("#bagbutton").click(function() {
  socket.emit("reqbot");
});

socket.on("bottom", function(state) {
  ucards(state, socket.id);
  if (socket.id == state.dealer) {
    $("#dmsg").html("discard 8 cards to bottom");
    $("#bagbutton").hide();
    $("#dwrap").show();
    $("#centerc").html("bottom: " + display(state.bottom));
  } else $("#dmsg").html("waiting for " + state.players[state.dealer].name + " to discard");
});

$("#discard").click(function() {
  var discards = [];
  for (let i = 0; i < 33; i++)
    if ($("#c" + i).prop("checked")) discards.push(i);
  if (discards.length == 8) socket.emit("discarding", discards);
  else {
    var s = "that was " + discards.length + " card";
    if (discards.length != 1) s += "s";
    $("#dismsg").html(s);
  }
});

socket.on("startplay", function(state) {
  $("#drawmsg").hide();
  $("#pwrap").hide();
  $("#centerc").html("");
  $("#pointc").html("");
  var dind = state.turnorder.indexOf(state.dealer);
  var ind = state.turnorder.indexOf(socket.id);
  if (state.players[socket.id].attack) {
    $("#config").html(
      state.players[state.dealer].name +
        " is the dealer playing " +
        rankmap[state.rank] +
        ", " +
        trumpmap[state.trump] +
        " with " +
        state.players[state.turnorder[(dind + 2) % 4]].name +
        " against you and " +
        state.players[state.turnorder[(ind + 2) % 4]].name
    );
  } else if (state.dealer == socket.id) {
    $("#config").html(
      "you are the dealer playing " +
        rankmap[state.rank] +
        ", " +
        trumpmap[state.trump] +
        " with " +
        state.players[state.turnorder[(ind + 2) % 4]].name +
        " against " +
        state.players[state.turnorder[(ind + 1) % 4]].name +
        " and " +
        state.players[state.turnorder[(ind + 3) % 4]].name
    );
  } else {
    $("#config").html(
      state.players[state.turnorder[dind]].name +
        " is the dealer playing " +
        rankmap[state.rank] +
        ", " +
        trumpmap[state.trump] +
        " with you against " +
        state.players[state.turnorder[(dind + 1) % 4]].name +
        " and " +
        state.players[state.turnorder[(dind + 3) % 4]].name
    );
  }
  if (state.dealer == socket.id)
    $("#bottom").html("bottom: " + state.bpt + " points");
  $("#playmsg").show();
});

socket.on("nextplay", function(state) {
  var ind = state.turnorder.indexOf(socket.id);
  ncards = state.players[socket.id].cards.length;
  $("#centerc").html("");
  $("#pointc").html("");
  $("#okwrap").hide();
  $("#chwrap").hide();
  $("#perror").html("");
  $("#botc").html(display(state.players[socket.id].play));
  $("#rightc").html(
    display(state.players[state.turnorder[(ind + 1) % 4]].play)
  );
  $("#topc").html(display(state.players[state.turnorder[(ind + 2) % 4]].play));
  $("#leftc").html(display(state.players[state.turnorder[(ind + 3) % 4]].play));
  $("#points").html("points earned: " + state.points);
  $("#penalty").html("penalty: " + state.penalty);
  $("#pcards").html(display(state.pcards));
  var going = false;
  if (ind == state.turn) {
    $("#tmsg").html("it is your turn");
    going = true;
    $("#pwrap").show();
  } else {
    $("#tmsg").html(
      "it is " + state.players[state.turnorder[state.turn]].name + "'s turn"
    );
    $("#pwrap").hide();
  }
  $(posmap[(state.turn + 4 - ind) % 4]).css("color", "blue");
  $(posmap[(state.turn + 5 - ind) % 4]).css("color", "black");
  $(posmap[(state.turn + 6 - ind) % 4]).css("color", "black");
  $(posmap[(state.turn + 7 - ind) % 4]).css("color", "black");
  pcards(state, socket.id);
});

$("#play").click(function() {
  var plays = [];
  for (let i = 0; i < ncards; i++)
    if ($("#c" + i).prop("checked")) plays.push(i);
  socket.emit("playing", plays);
});

socket.on("err", function(msg) {
  $("#perror").html(msg);
});

socket.on("rounddone", function(state) {
  var ind = state.turnorder.indexOf(socket.id);
  $("#botc").html(display(state.players[socket.id].play));
  $("#rightc").html(
    display(state.players[state.turnorder[(ind + 1) % 4]].play)
  );
  $("#topc").html(display(state.players[state.turnorder[(ind + 2) % 4]].play));
  $("#leftc").html(display(state.players[state.turnorder[(ind + 3) % 4]].play));
  $("#perror").html("");
  var wth = " won the hand";
  if (state.winner == socket.id) wth = "you" + wth;
  else wth = state.players[state.winner].name + wth;
  $("#centerc").html(wth);
  if (state.players[state.winner].attack && state.ptc != 0) {
    var wind = state.turnorder.indexOf(state.winner);
    if ((ind + wind) % 2 == 0)
      $("#pointc").html(
        "you and " +
          state.players[
            state.turnorder[(state.turnorder.indexOf(socket.id) + 2) % 4]
          ].name +
          " got " +
          state.ptc +
          " points"
      );
    else
      $("#pointc").html(
        state.players[state.winner].name +
          " and " +
          state.players[
            state.turnorder[(state.turnorder.indexOf(state.winner) + 2) % 4]
          ].name +
          " got " +
          state.ptc +
          " points"
      );
  }
  $("#tmsg").html("click ok to continue");
  $("#points").html("points earned: " + state.points);
  $("#penalty").html("penalty: " + state.penalty);
  $("#pcards").html(display(state.pcards));
  $("#topp").css("color", "black");
  $("#leftp").css("color", "black");
  $("#rightp").css("color", "black");
  $("#botp").css("color", "black");
  $("#pwrap").hide();
  $("#okwrap").show();
  scards(state, socket.id);
});

$("#ok").click(function() {
  socket.emit("ok");
  $("#okwrap").hide();
  $("#tmsg").html("waiting for other players");
});

socket.on("playdone", function(state) {
  $("#draws").hide();
  $("#scored").html(
    "points won: [" + state.points + "] " + display(state.pcards)
  );
  if (state.penalty != 0) $("#penaltied").html("penalty: " + state.penalty);
  var fscore = "final score: " + state.finalscore;
  if (state.players[state.winner].attack) {
    fscore +=
      " = " + state.points + " + " + 2 ** state.psize + " × " + state.bpt;
    if (state.penalty > 0) fscore += " + " + state.penalty;
    if (state.penalty < 0) fscore += " - " + Math.abs(state.penalty);
  } else {
    if (state.penalty > 0)
      fscore += " = " + state.points + " + " + state.penalty;
    if (state.penalty < 0)
      fscore += " = " + state.points + " − " + Math.abs(state.penalty);
  }
  $("#fscore").html(fscore);
  $("#bottomc").html("bottom: [" + state.bpt + "] " + display(state.bottom));
  var wmsg = "";
  var ind = state.turnorder.indexOf(socket.id);
  var dind = state.turnorder.indexOf(state.dealer);
  if (state.rankup == 0) wmsg = "no one ranked up";
  else {
    if ((dind + ind) % 2 == 1)
      wmsg =
        state.players[state.dealer].name +
        " and " +
        state.players[
          state.turnorder[(state.turnorder.indexOf(state.dealer) + 2) % 4]
        ].name +
        " ranked up by " +
        state.rankup +
        " to " +
        rankmap[state.rank];
    else
      wmsg =
        "you and " +
        state.players[
          state.turnorder[(state.turnorder.indexOf(socket.id) + 2) % 4]
        ].name +
        " ranked up by " +
        state.rankup +
        " to " +
        rankmap[state.rank];
  }
  $("#wmsg").html(wmsg);
  var nextdeal = "";
  if ((dind + ind) % 2 == 1)
    nextdeal =
      state.players[state.dealer].name +
      " is the next dealer playing " +
      rankmap[state.rank] +
      " with " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(state.dealer) + 2) % 4]
      ].name +
      " against you and " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 2) % 4]
      ].name;
  else if (dind == ind)
    nextdeal =
      "you are the next dealer playing " +
      rankmap[state.rank] +
      " with " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 2) % 4]
      ].name +
      " against " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 1) % 4]
      ].name +
      " and " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 3) % 4]
      ].name;
  else
    nextdeal =
      state.players[state.dealer].name +
      " is the next dealer playing " +
      rankmap[state.rank] +
      " with you against " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 1) % 4]
      ].name +
      " and " +
      state.players[
        state.turnorder[(state.turnorder.indexOf(socket.id) + 3) % 4]
      ].name;
  if (state.winmsg) {
    var gwmsg = "";
    if ((dind + ind) % 2 == 1)
      gwmsg =
        state.players[state.dealer].name +
        " and " +
        state.players[
          state.turnorder[(state.turnorder.indexOf(state.dealer) + 2) % 4]
        ].name +
        " won the game but you can keep playing";
    else
      gwmsg =
        "you and " +
        state.players[
          state.turnorder[(state.turnorder.indexOf(socket.id) + 2) % 4]
        ].name +
        " won the game but you can keep playing";
    $("#gwmsg").html(gwmsg);
  }
  $("#nextdeal").html(nextdeal);
  $("#cwrap").show();
  $("#cmsg").html("click continue for next round");
  $("#postgame").show();
});

$("#cont").click(function() {
  socket.emit("cont");
  $("#cwrap").hide();
  $("#cmsg").html("waiting for other players");
});

socket.on("next", function() {
  socket.emit("start");
});

socket.on("badthrow", function(state) {
  var ind = state.turnorder.indexOf(socket.id);
  ncards = state.players[socket.id].cards.length;
  $(posmap[(state.turn + 4 - ind) % 4]).css("color", "black");
  $(posmap[(state.turn + 5 - ind) % 4]).css("color", "blue");
  $(posmap[(state.turn + 6 - ind) % 4]).css("color", "blue");
  $(posmap[(state.turn + 7 - ind) % 4]).css("color", "blue");
  $("#botc").html(display(state.players[socket.id].play));
  $("#rightc").html(
    display(state.players[state.turnorder[(ind + 1) % 4]].play)
  );
  $("#topc").html(display(state.players[state.turnorder[(ind + 2) % 4]].play));
  $("#leftc").html(display(state.players[state.turnorder[(ind + 3) % 4]].play));
  $("#centerc").html("bad throw");
  if (state.turnorder[state.turn] == socket.id) {
    $("#perror").html("");
    $("#tmsg").html("waiting for other players to challenge");
    scards(state, socket.id);
    $("#pwrap").hide();
  } else {
    $("#tmsg").html("challenge if you can beat the throw");
    $("#chwrap").show();
    var s = ["spades: ", "hearts: ", "diamonds: ", "clubs: ", "trump: "];
    for (let i = 0; i < state.players[socket.id].cards.length; i++) {
      var j = state.players[socket.id].cards[i];
      if (j < 104 && j % 26 != 2 * state.rank && j % 26 != 2 * state.rank + 1) {
        if (Math.floor(j / 26) != state.trump)
          s[Math.floor(j / 26)] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        else
          s[4] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    }
    var d = state.players[socket.id].cards;
    for (let i = 0; i < 4; i++)
      if (i != state.trump) {
        if (d.includes(26 * i + 2 * state.rank))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank) +
            "'>" +
            cards[26 * i + 2 * state.rank] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        if (d.includes(26 * i + 2 * state.rank + 1))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank + 1) +
            "'>" +
            cards[26 * i + 2 * state.rank + 1] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        cards[26 * i + 2 * state.rank + 1] + "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    cards[26 * state.trump + 2 * state.rank] +
      "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank + 1))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank + 1) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank + 1] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    cards[26 * state.trump + 2 * state.rank + 1] +
      "</input>\u00A0\u00A0\u00A0\u00A0";
    for (let i = 104; i < 108; i++)
      if (d.includes(i))
        s[4] +=
          "<input type='checkbox' id='c" +
          d.indexOf(i) +
          "'>" +
          cards[i] +
          "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump < 4) s[state.trump] = "";
    for (let i = 0; i < 4; i++) $("#" + trumpmap[i]).html(s[i]);
    $("#trump").html(s[4]);
  }
});

$("#challenge").click(function() {
  var challenge = [];
  for (let i = 0; i < ncards; i++)
    if ($("#c" + i).prop("checked")) challenge.push(i);
  socket.emit("challenge", challenge);
});

var ncards = 0;

var posmap = ["#botp", "#rightp", "#topp", "#leftp"];

var poscmap = ["#botc", "#rightc", "topc", "leftc"];

var suitmap = [
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "spades",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "hearts",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "diamonds",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "clubs",
  "no trump",
  "no trump",
  "no trump",
  "no trump"
];

var cards = [
  "<span class='largefont'>&#x1f0a2;</span>",
  "<span class='largefont'>&#x1f0a2;</span>",
  "<span class='largefont'>&#x1f0a3;</span>",
  "<span class='largefont'>&#x1f0a3;</span>",
  "<span class='largefont'>&#x1f0a4;</span>",
  "<span class='largefont'>&#x1f0a4;</span>",
  "<span class='largefont'>&#x1f0a5;</span>",
  "<span class='largefont'>&#x1f0a5;</span>",
  "<span class='largefont'>&#x1f0a6;</span>",
  "<span class='largefont'>&#x1f0a6;</span>",
  "<span class='largefont'>&#x1f0a7;</span>",
  "<span class='largefont'>&#x1f0a7;</span>",
  "<span class='largefont'>&#x1f0a8;</span>",
  "<span class='largefont'>&#x1f0a8;</span>",
  "<span class='largefont'>&#x1f0a9;</span>",
  "<span class='largefont'>&#x1f0a9;</span>",
  "<span class='largefont'>&#x1f0aa;</span>",
  "<span class='largefont'>&#x1f0aa;</span>",
  "<span class='largefont'>&#x1f0ab;</span>",
  "<span class='largefont'>&#x1f0ab;</span>",
  "<span class='largefont'>&#x1f0ad;</span>",
  "<span class='largefont'>&#x1f0ad;</span>",
  "<span class='largefont'>&#x1f0ae;</span>",
  "<span class='largefont'>&#x1f0ae;</span>",
  "<span class='largefont'>&#x1f0a1;</span>",
  "<span class='largefont'>&#x1f0a1;</span>",
  "<span class='red largefont'>&#x1f0b2;</span>",
  "<span class='red largefont'>&#x1f0b2;</span>",
  "<span class='red largefont'>&#x1f0b3;</span>",
  "<span class='red largefont'>&#x1f0b3;</span>",
  "<span class='red largefont'>&#x1f0b4;</span>",
  "<span class='red largefont'>&#x1f0b4;</span>",
  "<span class='red largefont'>&#x1f0b5;</span>",
  "<span class='red largefont'>&#x1f0b5;</span>",
  "<span class='red largefont'>&#x1f0b6;</span>",
  "<span class='red largefont'>&#x1f0b6;</span>",
  "<span class='red largefont'>&#x1f0b7;</span>",
  "<span class='red largefont'>&#x1f0b7;</span>",
  "<span class='red largefont'>&#x1f0b8;</span>",
  "<span class='red largefont'>&#x1f0b8;</span>",
  "<span class='red largefont'>&#x1f0b9;</span>",
  "<span class='red largefont'>&#x1f0b9;</span>",
  "<span class='red largefont'>&#x1f0ba;</span>",
  "<span class='red largefont'>&#x1f0ba;</span>",
  "<span class='red largefont'>&#x1f0bb;</span>",
  "<span class='red largefont'>&#x1f0bb;</span>",
  "<span class='red largefont'>&#x1f0bd;</span>",
  "<span class='red largefont'>&#x1f0bd;</span>",
  "<span class='red largefont'>&#x1f0be;</span>",
  "<span class='red largefont'>&#x1f0be;</span>",
  "<span class='red largefont'>&#x1f0b1;</span>",
  "<span class='red largefont'>&#x1f0b1;</span>",
  "<span class='red largefont'>&#x1f0c2;</span>",
  "<span class='red largefont'>&#x1f0c2;</span>",
  "<span class='red largefont'>&#x1f0c3;</span>",
  "<span class='red largefont'>&#x1f0c3;</span>",
  "<span class='red largefont'>&#x1f0c4;</span>",
  "<span class='red largefont'>&#x1f0c4;</span>",
  "<span class='red largefont'>&#x1f0c5;</span>",
  "<span class='red largefont'>&#x1f0c5;</span>",
  "<span class='red largefont'>&#x1f0c6;</span>",
  "<span class='red largefont'>&#x1f0c6;</span>",
  "<span class='red largefont'>&#x1f0c7;</span>",
  "<span class='red largefont'>&#x1f0c7;</span>",
  "<span class='red largefont'>&#x1f0c8;</span>",
  "<span class='red largefont'>&#x1f0c8;</span>",
  "<span class='red largefont'>&#x1f0c9;</span>",
  "<span class='red largefont'>&#x1f0c9;</span>",
  "<span class='red largefont'>&#x1f0ca;</span>",
  "<span class='red largefont'>&#x1f0ca;</span>",
  "<span class='red largefont'>&#x1f0cb;</span>",
  "<span class='red largefont'>&#x1f0cb;</span>",
  "<span class='red largefont'>&#x1f0cd;</span>",
  "<span class='red largefont'>&#x1f0cd;</span>",
  "<span class='red largefont'>&#x1f0ce;</span>",
  "<span class='red largefont'>&#x1f0ce;</span>",
  "<span class='red largefont'>&#x1f0c1;</span>",
  "<span class='red largefont'>&#x1f0c1;</span>",
  "<span class='largefont'>&#x1f0d2;</span>",
  "<span class='largefont'>&#x1f0d2;</span>",
  "<span class='largefont'>&#x1f0d3;</span>",
  "<span class='largefont'>&#x1f0d3;</span>",
  "<span class='largefont'>&#x1f0d4;</span>",
  "<span class='largefont'>&#x1f0d4;</span>",
  "<span class='largefont'>&#x1f0d5;</span>",
  "<span class='largefont'>&#x1f0d5;</span>",
  "<span class='largefont'>&#x1f0d6;</span>",
  "<span class='largefont'>&#x1f0d6;</span>",
  "<span class='largefont'>&#x1f0d7;</span>",
  "<span class='largefont'>&#x1f0d7;</span>",
  "<span class='largefont'>&#x1f0d8;</span>",
  "<span class='largefont'>&#x1f0d8;</span>",
  "<span class='largefont'>&#x1f0d9;</span>",
  "<span class='largefont'>&#x1f0d9;</span>",
  "<span class='largefont'>&#x1f0da;</span>",
  "<span class='largefont'>&#x1f0da;</span>",
  "<span class='largefont'>&#x1f0db;</span>",
  "<span class='largefont'>&#x1f0db;</span>",
  "<span class='largefont'>&#x1f0dd;</span>",
  "<span class='largefont'>&#x1f0dd;</span>",
  "<span class='largefont'>&#x1f0de;</span>",
  "<span class='largefont'>&#x1f0de;</span>",
  "<span class='largefont'>&#x1f0d1;</span>",
  "<span class='largefont'>&#x1f0d1;</span>",
  "<span class='largefont'>&#x1f0df;</span>",
  "<span class='largefont'>&#x1f0df;</span>",
  "<span class='red largefont'>&#x1f0df;</span>",
  "<span class='red largefont'>&#x1f0df;</span>"
];

var cardnames = [
  "two of spades",
  "two of spades",
  "three of spades",
  "three of spades",
  "four of spades",
  "four of spades",
  "five of spades",
  "five of spades",
  "six of spades",
  "six of spades",
  "seven of spades",
  "seven of spades",
  "eight of spades",
  "eight of spades",
  "nine of spades",
  "nine of spades",
  "ten of spades",
  "ten of spades",
  "jack of spades",
  "jack of spades",
  "queen of spades",
  "queen of spades",
  "king of spades",
  "king of spades",
  "ace of spades",
  "ace of spades",
  "two of hearts",
  "two of hearts",
  "three of hearts",
  "three of hearts",
  "four of hearts",
  "four of hearts",
  "five of hearts",
  "five of hearts",
  "six of hearts",
  "six of hearts",
  "seven of hearts",
  "seven of hearts",
  "eight of hearts",
  "eight of hearts",
  "nine of hearts",
  "nine of hearts",
  "ten of hearts",
  "ten of hearts",
  "jack of hearts",
  "jack of hearts",
  "queen of hearts",
  "queen of hearts",
  "king of hearts",
  "king of hearts",
  "ace of hearts",
  "ace of hearts",
  "two of diamonds",
  "two of diamonds",
  "three of diamonds",
  "three of diamonds",
  "four of diamonds",
  "four of diamonds",
  "five of diamonds",
  "five of diamonds",
  "six of diamonds",
  "six of diamonds",
  "seven of diamonds",
  "seven of diamonds",
  "eight of diamonds",
  "eight of diamonds",
  "nine of diamonds",
  "nine of diamonds",
  "ten of diamonds",
  "ten of diamonds",
  "jack of diamonds",
  "jack of diamonds",
  "queen of diamonds",
  "queen of diamonds",
  "king of diamonds",
  "king of diamonds",
  "ace of diamonds",
  "ace of diamonds",
  "two of clubs",
  "two of clubs",
  "three of clubs",
  "three of clubs",
  "four of clubs",
  "four of clubs",
  "five of clubs",
  "five of clubs",
  "six of clubs",
  "six of clubs",
  "seven of clubs",
  "seven of clubs",
  "eight of clubs",
  "eight of clubs",
  "nine of clubs",
  "nine of clubs",
  "ten of clubs",
  "ten of clubs",
  "jack of clubs",
  "jack of clubs",
  "queen of clubs",
  "queen of clubs",
  "king of clubs",
  "king of clubs",
  "ace of clubs",
  "ace of clubs",
  "small joker",
  "small joker",
  "big joker",
  "big joker"
];

var resetids = [
  "#name",
  "#pgmsg",
  "#pdmsg",
  "#topp",
  "#topc",
  "#leftp",
  "#leftc",
  "#centerc",
  "#pointc",
  "#rightc",
  "#rightp",
  "#botc",
  "#botp",
  "#spades",
  "#hearts",
  "#diamonds",
  "#clubs",
  "#trump",
  "#bottom",
  "#dismsg",
  "#rmsg",
  "#dmsg",
  "#rbuts",
  "#dturn",
  "#perror",
  "#tmsg",
  "#points",
  "#config",
  "#pcards",
  "#penalty",
  "#penaltied",
  "#scored",
  "#bottomc",
  "#fscore",
  "#wmsg",
  "#nextdeal",
  "#cmsg",
  "#gwmsg"
];

var rankmap = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];

var trumpmap = ["spades", "hearts", "diamonds", "clubs", "no trump"];

var autodraw = false;

function rcards(state, id) {
  var s = "spades:";
  var h = "hearts:";
  var d = "diamonds:";
  var c = "clubs:";
  var t = "trump:";
  for (i = 0; i < state.players[id].cards.length; i++) {
    var j = state.players[id].cards[i];
    if (j > 103 || j % 26 == 2 * state.rank || j % 26 == 2 * state.rank + 1)
      t += " " + cards[j];
    else if (j < 26) s += " " + cards[j];
    else if (j < 52) h += " " + cards[j];
    else if (j < 78) d += " " + cards[j];
    else c += " " + cards[j];
  }
  $("#spades").html(s);
  $("#hearts").html(h);
  $("#diamonds").html(d);
  $("#clubs").html(c);
  $("#trump").html(t);
  var str = "last card: ";
  if (state.players[id].lastcard != "") {
    str +=
      cards[state.players[id].lastcard] +
      " " +
      cardnames[state.players[id].lastcard];
  }
  $("#dmsg").html(str);
}

function ucards(state, id) {
  var s = ["spades: ", "hearts: ", "diamonds: ", "clubs: ", "trump: "];
  if (state.dealer == id) {
    for (let i = 0; i < state.players[id].cards.length; i++) {
      var j = state.players[id].cards[i];
      if (j < 104 && j % 26 != 2 * state.rank && j % 26 != 2 * state.rank + 1) {
        if (Math.floor(j / 26) != state.trump)
          s[Math.floor(j / 26)] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        else
          s[4] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    }
    var d = state.players[id].cards;
    for (let i = 0; i < 4; i++)
      if (i != state.trump) {
        if (d.includes(26 * i + 2 * state.rank))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank) +
            "'>" +
            cards[26 * i + 2 * state.rank] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        if (d.includes(26 * i + 2 * state.rank + 1))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank + 1) +
            "'>" +
            cards[26 * i + 2 * state.rank + 1] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        cards[26 * i + 2 * state.rank + 1] + "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank + 1))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank + 1) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank + 1] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    for (let i = 104; i < 108; i++)
      if (d.includes(i))
        s[4] +=
          "<input type='checkbox' id='c" +
          d.indexOf(i) +
          "'>" +
          cards[i] +
          "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump < 4) s[state.trump] = "";
    for (let i = 0; i < 4; i++) $("#" + trumpmap[i]).html(s[i]);
    $("#trump").html(s[4]);
  } else scards(state, id);
}

function pcards(state, id) {
  var s = ["spades: ", "hearts: ", "diamonds: ", "clubs: ", "trump: "];
  if (state.turnorder[state.turn] == id) {
    for (let i = 0; i < state.players[id].cards.length; i++) {
      var j = state.players[id].cards[i];
      if (j < 104 && j % 26 != 2 * state.rank && j % 26 != 2 * state.rank + 1) {
        if (Math.floor(j / 26) != state.trump)
          s[Math.floor(j / 26)] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        else
          s[4] +=
            "<input type='checkbox' id='c" +
            i +
            "'>" +
            cards[j] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    }
    var d = state.players[id].cards;
    for (let i = 0; i < 4; i++)
      if (i != state.trump) {
        if (d.includes(26 * i + 2 * state.rank))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank) +
            "'>" +
            cards[26 * i + 2 * state.rank] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        if (d.includes(26 * i + 2 * state.rank + 1))
          s[4] +=
            "<input type='checkbox' id='c" +
            d.indexOf(26 * i + 2 * state.rank + 1) +
            "'>" +
            cards[26 * i + 2 * state.rank + 1] +
            "</input>\u00A0\u00A0\u00A0\u00A0";
        cards[26 * i + 2 * state.rank + 1] + "</input>\u00A0\u00A0\u00A0\u00A0";
      }
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    cards[26 * state.trump + 2 * state.rank] +
      "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank + 1))
      s[4] +=
        "<input type='checkbox' id='c" +
        d.indexOf(26 * state.trump + 2 * state.rank + 1) +
        "'>" +
        cards[26 * state.trump + 2 * state.rank + 1] +
        "</input>\u00A0\u00A0\u00A0\u00A0";
    cards[26 * state.trump + 2 * state.rank + 1] +
      "</input>\u00A0\u00A0\u00A0\u00A0";
    for (let i = 104; i < 108; i++)
      if (d.includes(i))
        s[4] +=
          "<input type='checkbox' id='c" +
          d.indexOf(i) +
          "'>" +
          cards[i] +
          "</input>\u00A0\u00A0\u00A0\u00A0";
    if (state.trump < 4) s[state.trump] = "";
    for (let i = 0; i < 4; i++) $("#" + trumpmap[i]).html(s[i]);
    $("#trump").html(s[4]);
  } else scards(state, id);
}

function scards(state, id) {
  var s = ["spades: ", "hearts: ", "diamonds: ", "clubs: ", "trump: "];
  for (let i = 0; i < state.players[id].cards.length; i++) {
    var j = state.players[id].cards[i];
    if (j < 104 && j % 26 != 2 * state.rank && j % 26 != 2 * state.rank + 1) {
      if (Math.floor(j / 26) != state.trump)
        s[Math.floor(j / 26)] += " " + cards[j];
      else s[4] += " " + cards[j];
    }
  }
  var d = state.players[id].cards;
  for (let i = 0; i < 4; i++)
    if (i != state.trump) {
      if (d.includes(26 * i + 2 * state.rank))
        s[4] += " " + cards[26 * i + 2 * state.rank];
      if (d.includes(26 * i + 2 * state.rank + 1))
        s[4] += " " + cards[26 * i + 2 * state.rank + 1];
    }
  if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank))
    s[4] += " " + cards[26 * state.trump + 2 * state.rank];
  if (state.trump != 4 && d.includes(26 * state.trump + 2 * state.rank + 1))
    s[4] += " " + cards[26 * state.trump + 2 * state.rank + 1];
  for (let i = 104; i < 108; i++) if (d.includes(i)) s[4] += " " + cards[i];
  if (state.trump < 4) s[state.trump] = "";
  for (let i = 0; i < 4; i++) $("#" + trumpmap[i]).html(s[i]);
  $("#trump").html(s[4]);
}

function declares(state, id) {
  var dec = [];
  if (!state.players[id].passed) {
    var r = state.rank;
    var c = state.players[id].cards;
    if (state.declarer != id) {
      for (let i = 0; i < 104; i += 26)
        if (
          (c.includes(i + 2 * r) || c.includes(i + 2 * r + 1)) &&
          state.declared != id &&
          state.dlevel < 1
        )
          dec.push([i + 2 * r]);
      for (let i = 0; i < 104; i += 26)
        if (
          c.includes(i + 2 * r) &&
          c.includes(i + 2 * r + 1) &&
          state.dlevel < 2
        )
          if (state.declared != id || state.declared[0] == i + 2 * r)
            dec.push([i + 2 * r, i + 2 * r + 1]);
      if (
        c.includes(104) &&
        c.includes(105) &&
        state.dlevel < 3 &&
        state.declared != id
      )
        dec.push([104, 105]);
      if (
        c.includes(106) &&
        c.includes(107) &&
        state.dlevel < 3 &&
        state.declared != id
      )
        dec.push([106, 107]);
    } else {
      var suit = Math.floor(state.players[id].play[0] / 26);
      if (
        state.dlevel < 2 &&
        c.includes(26 * suit + 2 * r) &&
        c.includes(26 * suit + 2 * r + 1)
      )
        dec.push([26 * suit + 2 * r, 26 * suit + 2 * r + 1]);
    }
  }
  return dec;
}

function dbuttons(arr) {
  var s = "declare: ";
  for (let i = 0; i < arr.length; i++) {
    var t = "";
    for (var j = 0; j < arr[i].length; j++) t += cards[arr[i][j]];
    s += "<button id='b" + i + "'>" + t + "</button>";
  }
  return s;
}

function display(arr) {
  var s = "";
  for (let i = 0; i < arr.length; i++) s += cards[arr[i]];
  return s;
}

function declaring(state, id) {
  var ind = state.turnorder.indexOf(id);
  $("#botc").html(display(state.players[id].play));
  $("#rightc").html(
    display(state.players[state.turnorder[(ind + 1) % 4]].play)
  );
  $("#topc").html(display(state.players[state.turnorder[(ind + 2) % 4]].play));
  $("#leftc").html(display(state.players[state.turnorder[(ind + 3) % 4]].play));
  if (state.declarer == "") $("#rmsg").html("nothing declared");
  else if (id == state.declarer)
    $("#rmsg").html(
      "you declared " +
        suitmap[state.declared[0]] +
        " " +
        display(state.declared)
    );
  else
    $("#rmsg").html(
      state.players[state.declarer].name +
        " declared " +
        suitmap[state.declared[0]] +
        " " +
        display(state.declared)
    );
  rcards(state, id);
  var dec = declares(state, id);
  var haspass = false;
  var dbut = dbuttons(dec);
  if (
    state.drawn == 100 &&
    !state.players[id].passed &&
    (id != state.declarer || dbut != "declare: ")
  ) {
    dbut += "<button id='pass'>pass</button>";
    haspass = true;
  }
  $("#rbuts").html(dbut);
  for (let i = 0; i < dec.length; i++)
    $("#b" + i).click(function() {
      socket.emit("declare", dec[i]);
    });
  if (haspass)
    $("#pass").click(function() {
      socket.emit("pass");
      $("#rbuts").html("declare: ");
    });
  if (
    (state.drawn == 100 &&
      !state.players[id].passed &&
      id == state.declarer &&
      dbut == "declare: ") ||
    (state.drawn == 100 && state.dlevel == 3)
  )
    socket.emit("pass");
  console.log(autodraw);
  console.log(ind);
  console.log(state.turn);
  if (autodraw && state.drawn < 100 && ind == (state.turn + 1) % 4)
    socket.emit("reqdraw");
}
