// Dependencies
var express = require("express");
var http = require("http");
var path = require("path");
const port = process.env.PORT || 5000;
var socketIO = require("socket.io");
var app = express();
var server = http.Server(app);
var io = socketIO(server, {
  pingInterval: 2000,
  pingTimeout: 600000
});
app.set("port", port);
app.use("/static", express.static(__dirname + "/static")); // Routing
app.get("*", function(request, response) {
  response.sendFile(path.join(__dirname, "index.html"));
}); // Starts the server.
server.listen(port, function() {
  console.log("Starting server on port 5000");
});

var state = {};
state.players = {};
state.stage = "pregame";

// Add the WebSocket handlers
io.on("connection", function(socket) {
  socket.on("enter", function() {
    socket.emit("welcome", state);
  });

  socket.on("reqjoin", function(pname) {
    var used = false;
    for (let i = 0; i < Object.keys(state.players).length; i++) {
      var p = Object.keys(state.players)[i];
      if (state.players[p].name == pname) {
        used = true;
        break;
      }
    }
    if (pname == "") socket.emit("nojoin", "enter a name");
    else if (used) socket.emit("nojoin", "choose a different name");
    else if (Object.keys(state.players).length >= 4)
      socket.emit("nojoin", "game full");
    else {
      if (Object.keys(state.players).length == 0) state.host = socket.id;
      state.players[socket.id] = { name: pname };
      io.sockets.emit("nameupdate", state);
      socket.emit("startdraw", state);
      if (Object.keys(state.players).length == 4)
        io.sockets.emit("readydraw", state);
    }
  });

  socket.on("start", function() {
    if (!Object.keys(state).includes("first")) state.first = true;
    state.stage = "draw";
    if (state.first) state.rank = 0;
    state.deck = shuffle(108);
    state.bottom = state.deck.slice(100);
    state.stalled = stall(state.deck);
    state.install = false;
    state.won = false;
    state.winmsg = false;
    if (!Object.keys(state).includes("redraw")) state.redraw = false;
    if (state.first) state.dealer = "";
    state.declarer = "";
    state.dlevel = 0;
    state.declared = [];
    if (state.first && !state.redraw) {
      var plist = Object.keys(state.players);
      var order = shuffle(4);
      state.turnorder = new Array(4);
      for (let i = 0; i < 4; i++) state.turnorder[i] = plist[order[i]];
      state.turn = 0;
    }
    state.drawn = 0;
    for (let i = 0; i < Object.keys(state.players).length; i++) {
      var p = Object.keys(state.players)[i];
      state.players[p].cards = [];
      state.players[p].lastcard = "";
      state.players[p].play = [];
      state.players[p].passed = false;
      if (state.first) state.players[p].rank = 0;
    }
    io.sockets.emit("loaddraw", state);
    io.sockets.emit("nextdraw", state);
  });

  socket.on("reqdraw", function() {
    console.log("HI");
    state.players[socket.id].cards = insert(
      state.players[socket.id].cards,
      state.deck[state.drawn]
    );
    state.players[socket.id].lastcard = state.deck[state.drawn];
    state.turn = (state.turn + 1) % 4;
    state.drawn++;
    io.sockets.emit("nextdraw", state);
  });

  socket.on("declare", function(arr) {
    if (arr.length > state.dlevel || (arr[0] > 103 && state.dlevel < 3)) {
      if (socket.id == state.declarer) {
        if (
          state.dlevel == 1 &&
          arr.length == 2 &&
          state.declared[0] == arr[0]
        ) {
          state.declared = arr;
          state.dlevel = 2;
          state.players[socket.id].play = arr;
        }
      } else {
        state.dlevel = arr.length;
        if (arr[0] > 103) state.dlevel = 3;
        state.declared = arr;
        state.declarer = socket.id;
        state.players[socket.id].play = arr.concat(
          state.players[socket.id].play
        );
      }
    }
    for (let i = 0; i < 4; i++)
      state.players[state.turnorder[i]].passed = false;
    state.redraw = false;
    io.sockets.emit("declaration", state);
  });

  socket.on("pass", function() {
    state.players[socket.id].passed = true;
    if (
      state.players[state.turnorder[0]].passed &&
      state.players[state.turnorder[1]].passed &&
      state.players[state.turnorder[2]].passed &&
      state.players[state.turnorder[3]].passed
    ) {
      if (state.declarer == "") {
        state.install = true;
        if (state.dealer == "") {
          state.redraw = true;
          socket.emit("next");
          return;
        } else state.declarer = state.dealer;
        state.trump = Math.floor(state.stalled[1] / 26);
      } else
        state.trump = Math.floor(state.players[state.declarer].play[0] / 26);
      if (state.first) state.dealer = state.declarer;
      var dind = state.turnorder.indexOf(state.dealer);
      for (let i = 0; i < 4; i++)
        state.players[state.turnorder[(dind + i) % 4]].attack = i % 2 == 1;
      io.sockets.emit("drawdone", state);
    }
  });

  socket.on("reqbot", function() {
    for (let i = 0; i < 8; i++)
      state.players[state.dealer].cards = insert(
        state.players[state.dealer].cards,
        state.bottom[i]
      );
    io.sockets.emit("bottom", state);
  });

  socket.on("discarding", function(discards) {
    if (discards.length == 8) {
      var bot = [];
      for (let i = 0; i < 8; i++)
        bot.push(state.players[state.dealer].cards[discards[i]]);
      state.stage = "play";
      state.bottom = bot;
      state.bpt = 0;
      for (let i = 0; i < 8; i++) state.bpt += points[state.bottom[i]];
      state.played = 0;
      state.turn = state.turnorder.indexOf(state.dealer);
      for (let i = 7; i > -1; i--)
        state.players[state.dealer].cards = remove(
          state.players[state.dealer].cards,
          discards[i]
        );
      for (let i = 0; i < 4; i++)
        state.players[Object.keys(state.players)[i]].play = [];
      state.points = 0;
      state.penalty = 0;
      state.pcards = [];
      priority = prioritize(state.rank, state.trump);
      for (let i = 0; i < 4; i++) {
        state.players[state.turnorder[i]].oked = false;
        state.players[state.turnorder[i]].conted = false;
      }
      io.sockets.emit("startplay", state);
      io.sockets.emit("nextplay", state);
    }
  });

  socket.on("playing", function(plays) {
    console.log(Object.keys(state.players));
    var pcs = [];
    for (let i = 0; i < plays.length; i++)
      pcs.push(state.players[socket.id].cards[plays[i]]);
    if (state.played == 0) {
      state.ptc = 0;
      if (plays.length == 0) {
        socket.emit("err", "play at least one card");
        return;
      }
      state.psize = pcs.length;
      state.suit = priority[pcs[0]][0];
      for (let i = 0; i < pcs.length; i++)
        if (state.suit != priority[pcs[i]][0]) {
          socket.emit("err", "play from the same suit");
          return;
        }
      if (
        nump(classify(priority, pcs)) > 1 &&
        !validp(
          priority,
          pcs,
          selsu(priority, state.players[socket.id].cards, state.suit)
        )
      ) {
        socket.emit("err", "invalid throw");
        return;
      }
    } else {
      if (pcs.length != state.psize) {
        var err = "play " + state.psize + " card";
        if (state.psize > 1) err += "s";
        socket.emit("err", err);
        return;
      }
      var numsuit = 0;
      for (let i = 0; i < state.players[socket.id].cards.length; i++)
        if (priority[state.players[socket.id].cards[i]][0] == state.suit)
          numsuit++;
      numsuit = Math.min(numsuit, state.psize);
      for (let i = 0; i < pcs.length; i++)
        if (priority[pcs[i]][0] == state.suit) numsuit--;
      if (numsuit > 0) {
        var extras = "s";
        if (state.psize == 1 || state.suit == 4) extras = "";
        socket.emit(
          "err",
          "play " +
            state.psize +
            " " +
            suitmap[state.suit] +
            extras +
            " or as many as you can"
        );
        return;
      }
      var proceed = true;
      for (let i = 0; i < pcs.length; i++)
        if (priority[pcs[i]][0] != state.suit) {
          proceed = false;
          break;
        }
      if (
        proceed &&
        ctpair(
          state.players[state.turnorder[(state.turn - state.played + 4) % 4]]
            .play
        ) > 0
      )
        if (
          !canpl(
            priority,
            state.players[state.turnorder[(state.turn - state.played + 4) % 4]]
              .play,
            state.players[socket.id].cards,
            pcs
          )
        ) {
          socket.emit(
            "err",
            "play more pairs and/or tractors to match " +
              state.players[
                state.turnorder[(state.turn - state.played + 4) % 4]
              ].name +
              " as much as you can"
          );
          return;
        }
    }
    state.players[socket.id].play = clean(priority, pcs);
    if (state.played == 0) {
      state.skip = -1;
      state.ptype = classify(priority, state.players[socket.id].play);
      state.pclass = pcla(state.ptype);
      state.classnum = 0;
      for (let i = 0; i < 16; i++) state.classnum += state.pclass[i];
      if (state.classnum > 1) {
        var invalid = false;
        for (let i = 1; i < 4; i++)
          if (
            !validp(
              priority,
              state.players[socket.id].play,
              selsu(
                priority,
                state.players[state.turnorder[(state.turn + i) % 4]].cards,
                state.suit
              )
            )
          ) {
            invalid = true;
            break;
          }
        if (invalid) {
          state.inchal = true;
          io.sockets.emit("badthrow", state);
          return;
        }
      }
      state.winner = socket.id;
    } else {
      var monoc = true;
      var psuit = priority[pcs[0]][0];
      for (let i = 0; i < pcs.size; i++)
        if (priority[pcs[i]][0] != psuit) {
          monoc = false;
          break;
        }
      if (monoc && (psuit == state.suit || psuit == 4)) {
        if (state.skip == -1 || state.skip < state.played) {
          if (
            compare(
              priority,
              state.ptype,
              state.players[state.winner].play,
              state.players[socket.id].play
            )
          )
            state.winner = socket.id;
        } else {
          if (
            !compare(
              priority,
              state.ptype,
              state.players[socket.id].play,
              state.players[state.winner].play
            )
          )
            state.winner = socket.id;
        }
      }
    }
    for (let i = plays.length - 1; i > -1; i--)
      state.players[socket.id].cards = remove(
        state.players[socket.id].cards,
        plays[i]
      );
    if (state.skip == state.played + 1) {
      state.played = (state.played + 2) % 4;
      state.turn = (state.turn + 2) % 4;
    } else {
      state.played = (state.played + 1) % 4;
      state.turn = (state.turn + 1) % 4;
    }
    if (state.played == 0) {
      if (state.players[state.winner].attack) {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < state.psize; j++) {
            var c = state.players[state.turnorder[i]].play[j];
            if (points[c] != 0) {
              state.pcards.push(c);
              state.points += points[c];
              state.ptc += points[c];
            }
          }
      }
      state.turn = state.turnorder.indexOf(state.winner);
      io.sockets.emit("rounddone", state);
    } else io.sockets.emit("nextplay", state);
  });

  socket.on("ok", function() {
    state.players[socket.id].oked = true;
    if (
      state.players[state.turnorder[0]].oked &&
      state.players[state.turnorder[1]].oked &&
      state.players[state.turnorder[2]].oked &&
      state.players[state.turnorder[3]].oked
    ) {
      for (let i = 0; i < 4; i++)
        state.players[state.turnorder[i]].oked = false;
      for (let i = 0; i < 4; i++) state.players[state.turnorder[i]].play = [];
      if (state.players[state.turnorder[0]].cards.length == 0) {
        state.finalscore = state.points + state.penalty;
        if (
          (state.turnorder.indexOf(state.winner) +
            state.turnorder.indexOf(state.dealer)) %
            2 ==
          1
        )
          state.finalscore += 2 ** state.psize * state.bpt;
        state.rankup = 0;
        if (state.finalscore < 80) {
          state.dealer =
            state.turnorder[(state.turnorder.indexOf(state.dealer) + 2) % 4];
          state.rankup = 1;
          if (state.finalscore < 40) state.rankup = 2;
          if (state.finalscore <= 0) state.rankup = 3;
        } else {
          state.dealer =
            state.turnorder[(state.turnorder.indexOf(state.dealer) + 1) % 4];
          if (state.finalscore >= 120) state.rankup = 1;
          if (state.finalscore >= 160) state.rankup = 2;
          if (state.finalscore >= 200) state.rankup = 3;
        }
        if (
          !state.won &&
          state.players[state.dealer].rank + state.rankup > 12
        ) {
          state.won = true;
          state.winmsg = true;
        }
        state.players[state.dealer].rank =
          (state.players[state.dealer].rank + state.rankup) % 13;
        state.players[
          state.turnorder[(state.turnorder.indexOf(state.dealer) + 2) % 4]
        ].rank = state.players[state.dealer].rank;
        state.rank = state.players[state.dealer].rank;
        state.turn = state.turnorder.indexOf(state.dealer);
        io.sockets.emit("playdone", state);
      } else io.sockets.emit("nextplay", state);
    }
  });

  socket.on("cont", function() {
    state.players[socket.id].conted = true;
    if (
      state.players[state.turnorder[0]].conted &&
      state.players[state.turnorder[1]].conted &&
      state.players[state.turnorder[2]].conted &&
      state.players[state.turnorder[3]].conted
    ) {
      state.first = false;
      state.winmsg = false;
      socket.emit("next");
    }
  });

  socket.on("challenge", function(challenge) {
    var pcs = [];
    for (let i = 0; i < challenge.length; i++)
      pcs.push(state.players[socket.id].cards[challenge[i]]);
    if (state.inchal) {
      var res = chal(
        priority,
        state.players[state.turnorder[state.turn]].play,
        pcs
      );
      if (!res[0]) {
        socket.emit("err", "invalid challenge");
        return;
      }
      var diff =
        state.players[state.turnorder[state.turn]].play.length -
        challenge.length;
      var dind = state.turnorder.indexOf(state.dealer);
      var pind = state.turn;
      if ((dind + pind) % 2 == 0) state.penalty += diff * 10;
      else state.penalty -= diff * 10;
      state.players[state.turnorder[state.turn]].play = res[1];
      for (let i = res[1].length - 1; i > -1; i--)
        state.players[state.turnorder[state.turn]].cards = remove(
          state.players[state.turnorder[state.turn]].cards,
          state.players[state.turnorder[state.turn]].cards.indexOf(res[1][i])
        );
      state.players[socket.id].play = clean(priority, pcs);
      for (let i = state.players[socket.id].play.length - 1; i > -1; i--)
        state.players[socket.id].cards = remove(
          state.players[socket.id].cards,
          state.players[socket.id].cards.indexOf(
            state.players[socket.id].play[i]
          )
        );
      state.winner = socket.id;
      state.skip = (state.turnorder.indexOf(socket.id) - state.turn + 4) % 4;
      state.psize = state.players[state.winner].play.length;
      state.ptype = classify(priority, state.players[state.winner].play);
      state.inchal = false;
      if (state.skip > 1) {
        state.played = (state.played + 1) % 4;
        state.turn = (state.turn + 1) % 4;
      } else {
        state.played = (state.played + 2) % 4;
        state.turn = (state.turn + 2) % 4;
      }
      io.sockets.emit("nextplay", state);
    }
  });

  socket.on("disconnect", function() {
    if (Object.keys(state.players).includes(socket.id)) {
      state = {};
      state.players = {};
      state.stage = "pregame";
      io.sockets.emit("reset", state);
    }
  });
});

function shuffle(n) {
  var deck = new Array(n);
  for (let i = 0; i < n; i++) deck[i] = i;
  for (let i = n - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
}

function insert(arr, i) {
  if (arr == []) return [i];
  var l = 0;
  var r = arr.length;
  while (r > l) {
    if (arr[Math.floor((r + l) / 2)] > i) r = Math.floor((r + l) / 2);
    else l = Math.floor((r + l) / 2) + 1;
  }
  return arr.slice(0, l).concat([i], arr.slice(l, arr.length));
}

function remove(arr, i) {
  return arr.slice(0, i).concat(arr.slice(i + 1, arr.length));
}

function stall() {
  var i;
  var show;
  var card;
  for (i = 100; i < 108; i++)
    if (
      state.deck[i] < 104 &&
      (state.deck[i] % 26 == 2 * state.rank ||
        state.deck[i] % 26 == 2 * state.rank + 1)
    )
      break;
  show = state.deck.slice(100, Math.min(108, i + 1));
  if (i < 108) card = state.deck[i];
  else {
    var j = 100;
    var maxj = 99;
    var maxv = -1;
    for (j = 100; j < 108; j++)
      if (state.deck[j] < 104 && state.deck[j] % 26 > maxv) {
        maxj = j;
        maxv = state.deck[j] % 26;
      }
    card = 26 * Math.floor(state.deck[maxj] / 26) + 2 * state.rank;
  }
  return [show, card];
}

function clean(prior, arr) {
  var cleaned = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 16; j++)
      for (let k = 0; k < arr.length; k++)
        if (i == prior[arr[k]][0] && j == prior[arr[k]][1])
          cleaned.push(arr[k]);
  return cleaned;
}

function prioritize(rank, trump) {
  var prior = new Array(108);
  for (let i = 0; i < 108; i++) {
    if (i < 104 && i % 26 != 2 * rank && i % 26 != 2 * rank + 1) {
      if (Math.floor(i / 26) != trump) {
        if (i % 26 < 2 * rank)
          prior[i] = [Math.floor(i / 26), Math.floor((i % 26) / 2)];
        else prior[i] = [Math.floor(i / 26), Math.floor((i % 26) / 2) - 1];
      } else {
        if (i % 26 < 2 * rank) prior[i] = [4, Math.floor((i % 26) / 2)];
        else prior[i] = [4, Math.floor((i % 26) / 2) - 1];
      }
    }
    if (i < 104 && (i % 26 == 2 * rank || i % 26 == 2 * rank + 1)) {
      if (Math.floor(i / 26) != trump) prior[i] = [4, 12];
      else prior[i] = [4, 13];
    }
    if (i == 104 || i == 105) {
      if (trump < 4) prior[i] = [4, 14];
      else prior[i] = [4, 13];
    }
    if (i == 106 || i == 107) {
      if (trump < 4) prior[i] = [4, 15];
      else prior[i] = [4, 14];
    }
  }
  return prior;
}

function sings(prior, play) {
  var ans = new Array(16);
  for (let i = 0; i < 16; i++) ans[i] = 0;
  for (let i = 0; i < play.length; i++) ans[prior[play[i]][1]] += 1;
  return ans;
}

function pairs(prior, play) {
  var ans = new Array(16);
  for (let i = 0; i < 16; i++) ans[i] = 0;
  for (let i = 0; i < play.length; i++)
    if (play[i] % 2 == 0 && play.includes(play[i] + 1))
      ans[prior[play[i]][1]] += 1;
  return ans;
}

function classify(prior, play) {
  var ans = {};
  var pairs = new Array(16);
  for (let i = 0; i < 16; i++) pairs[i] = 0;
  var npairs = 0;
  for (let i = 0; i < play.length; i++)
    if (play[i] % 2 == 0 && play.includes(play[i] + 1)) {
      pairs[prior[play[i]][1]] += 1;
      npairs++;
    }
  if (play.length > 2 * npairs) {
    ans["t0"] = [];
    for (let i = 0; i < play.length; i++)
      if (
        (play[i] % 2 == 0 && !play.includes(play[i] + 1)) ||
        (play[i] % 2 == 1 && !play.includes(play[i] - 1))
      )
        ans["t0"].push(prior[play[i]][1]);
  }
  var beg = 0;
  var end = 0;
  while (npairs > 0) {
    beg = end;
    for (let i = 0; i < 16; i++)
      if (pairs[i] != 0) {
        beg = i;
        break;
      }
    var end = 15;
    for (let i = beg; i < 16; i++) {
      if (pairs[i] == 0) {
        end = i - 1;
        break;
      } else pairs[i]--;
    }
    var key = "t" + (end - beg + 1);
    if (!Object.keys(ans).includes(key)) ans[key] = [];
    ans[key].push(end);
    npairs -= end - beg + 1;
  }
  return ans;
}

function typearr(classified) {
  var ans = new Array(16);
  for (let i = 0; i < 16; i++) ans[i] = 0;
  var keys = Object.keys(classified);
  for (let i = 0; i < keys.length; i++) {
    var num = parseInt(keys[i].substring(1));
    ans[num] = classified[keys[i]].length;
  }
  return ans;
}

function pcla(cla) {
  var ans = new Array(16);
  for (let i = 0; i < 16; i++) ans[i] = 0;
  var ckeys = Object.keys(cla);
  for (let i = 0; i < ckeys.length; i++)
    ans[parseInt(ckeys[i].substring(1))] = cla[ckeys[i]].length;
  return ans;
}

function nump(cla) {
  var sum = 0;
  var arr = pcla(cla);
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum;
}

function highp(pairs, num) {
  var count = 0;
  var ans = 15;
  for (let i = 15; i > -1; i--) {
    if (pairs[i] == 0) {
      ans = i - 1;
      count = 0;
    } else count++;
    if (count == num) return ans;
  }
  return -1;
}

function selsu(prior, hand, suit) {
  var ans = [];
  for (let i = 0; i < hand.length; i++)
    if (prior[hand[i]][0] == suit) ans.push(hand[i]);
  return clean(prior, ans);
}

function validp(prior, play, hand) {
  var classp = classify(prior, play);
  var remcards = hand;
  for (let i = play.length - 1; i > -1; i--)
    if (remcards.includes(play[i]))
      remcards = remove(remcards, remcards.indexOf(play[i]));
  remcards = clean(prior, remcards);
  var remsings = sings(prior, remcards);
  var rempairs = pairs(prior, remcards);
  var keys = Object.keys(classp);
  if (keys.includes("t0"))
    if (highp(remsings, 1) > classp["t0"][0]) return false;
  for (let i = 0; i < keys.length; i++) {
    var num = parseInt(keys[i].substring(1));
    if (num > 0) if (highp(rempairs, num) > classp[keys[i]][0]) return false;
  }
  return true;
}

function search(parr, sings, pairs) {
  var numpos = 0;
  var max = 0;
  for (let i = 0; i < 16; i++)
    if (parr[i] > 0) {
      numpos += parr[i];
      max = i;
    }
  if (numpos == 1) {
    if (max == 0) return highp(sings, 1);
    else return highp(pairs, max);
  }
  for (let i = 15; i > max - 1; i--) {
    var nparr = parr.slice();
    var nsing = sings.slice();
    var npair = pairs.slice();
    var proc = true;
    for (let j = i; j > i - max; j--)
      if (npair[j] == 0) {
        proc = false;
        break;
      }
    if (proc) {
      for (let j = i; j > i - max; j--) {
        npair[j]--;
        nsing[j] -= 2;
      }
      nparr[max]--;
      var rec = search(nparr, nsing, npair);
      if (rec > -1) return i;
    }
  }
  return -1;
}

function compare(prior, ptype, h1, h2) {
  var parr = typearr(ptype);
  var r1 = search(parr, sings(prior, h1), pairs(prior, h1));
  var r2 = search(parr, sings(prior, h2), pairs(prior, h2));
  if (r2 == -1) return false;
  if (prior[h1[0]][0] < 4 && prior[h2[0]][0] == 4) return true;
  if (prior[h1[0]][0] == 4 && prior[h2[0]][0] < 4) return false;
  if (r2 > r1) return true;
  return false;
}

function chal(prior, pl, ch) {
  var cpl = clean(prior, pl);
  var cch = clean(prior, ch);
  var ptype = classify(prior, cpl);
  var suit = prior[cpl[0]][0];
  for (let i = 0; i < cch.length; i++)
    if (prior[cch[i]][0] != suit) return [false];
  if (cch.length == 0) return [false];
  var cclass = classify(prior, cch);
  var keys = Object.keys(cclass);
  if (keys.length > 1) return [false];
  if (!Object.keys(ptype).includes(keys[0])) return [false];
  if (ptype[keys[0]][0] >= cclass[keys[0]][0]) return [false];
  var num = parseInt(keys[0].substring(1));
  if (num == 0)
    for (let i = 0; i < cpl.length; i++)
      if (
        (cpl[i] % 2 == 0 && !cpl.includes(cpl[i] + 1)) ||
        (cpl[i] % 2 == 1 && !cpl.includes(cpl[i] - 1))
      )
        return [true, [cpl[i]]];
  var should = [];
  var ran = ptype[keys[0]][0];
  var at = ran - num + 1;
  var ind = 0;
  while (at <= ran) {
    if (
      cpl[ind] % 2 == 0 &&
      cpl.includes(cpl[ind] + 1) &&
      prior[cpl[ind]][0] == suit &&
      prior[cpl[ind]][1] == at
    ) {
      should.push(cpl[ind]);
      should.push(cpl[ind] + 1);
      at++;
    }
    ind++;
  }
  return [true, should];
}

function ctpair(arr) {
  var ans = 0;
  for (let i = 0; i < arr.length; i++)
    if (arr[i] % 2 == 0 && arr.includes(arr[i] + 1)) ans++;
  return ans;
}

function partlist0(arr) {
  var s = JSON.stringify(arr);
  if (s == JSON.stringify([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
  if (s == JSON.stringify([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [
      [0, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ];
  if (s == JSON.stringify([0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    return [[0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
}

function partlist(arr) {
  var copy = arr;
  var st = copy[0];
  copy[0] = 0;
  var ans = partlist0(copy);
  for (let i = 0; i < ans.length; i++) ans[i][0] = st;
  return ans;
}

function canpl(prior, p1, ha, p2) {
  var suit = prior[p1[0]][0];
  var sha = selsu(prior, ha, suit);
  var shapairs = ctpair(sha);
  var p1pairs = ctpair(p1);
  var p2pairs = ctpair(p2);
  if (p2pairs < Math.min(p1pairs, shapairs)) return false;
  if (p2pairs == shapairs) return true;
  var clarr = typearr(classify(prior, p1));
  var parlist = partlist(clarr);
  var sin = sings(prior, sha);
  var pai = pairs(prior, sha);
  var ind = 0;
  for (ind = 0; ind < parlist.length; ind++)
    if (search(parlist[ind], sin, pai) > -1) break;
  return search(parlist[ind], sings(prior, p2), pairs(prior, p2)) > -1;
}

var points = [
  0,
  0,
  0,
  0,
  0,
  0,
  5,
  5,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  5,
  5,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  5,
  5,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  5,
  5,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  10,
  10,
  0,
  0,
  0,
  0,
  0,
  0
];

var suitmap = ["spade", "heart", "diamond", "club", "trump"];

var priority = [];

var clap = {};
