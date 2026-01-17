// Checkout the Guidebook examples to get an idea of other ways you can use scripting
// https://help.aidungeon.com/scripting
// Any functions or variables you define here will be available in your other modifier scripts.
const DIM_LIM = 8;
const CHAR_1 = 49;
const CHAR_8 = 56;
const CHAR_A = 65;
const CHAR_Z = 90;
const CHAR_a = 97;
const CHAR_h = 104;
const CHAR_z = 122;

class Chess {
    constructor() {
        this.board = createBoard();
        this.players = [new Player(true), new Player(false)];
        this.moves = [];
        this.moveNo = 0;
        this.moveDrawCt = 0;
        this.positions = {};

        //This variable decides whether a game is currently running, and whether to include game information in context.
        this.gameOn = false;
    }
}

class LegalEntry {
    constructor(dst, bits) {
        this.dst = dst;
        //1 for capture, 2 for check, 4 for castle
        this.bits = bits;
    }
}

class Move {
    constructor(id, piece, src, dst, disamb, cap, spec, draw) {
        this.id = id;
        this.piece = piece.type;
        this.src = src;
        this.dst = dst;
        this.disamb = disamb;
        this.cap = cap;

        //1 if two-space pawn move (EP), 2 if short castle, 3 if long castle, 4 if EP capture,
        //5 for king/rook move that waives castling rights, piece name if promotion.
        this.spec = spec;

        //0 if not a check, 1 if check, 2 if checkmate, 3 if stalemate,
        //4 if draw by insufficient material, 5 if draw by repetition,
        //6 if 50-move draw.
        this.check = 0;
        this.draw = draw;
    }
}

class Piece {
    constructor(color, type, rank, file, castle) {
        this.color = color;
        this.type = type;
        this.rank = rank;
        this.file = file;
        this.canCastle = castle;
        if(0 <= rank && rank < DIM_LIM) {
            state.chess.board[rank][file].piece = this;
        }
    }
}

class Player {
    constructor(color) {
        this.color = color;
        this.name = color ? "White" : "Black";
        this.legal = {};
    }
}

class SightLine {
    constructor(di, dj, dist) {
        this.di = di;
        this.dj = dj;
        this.dist = dist;
    }
}

class Space {
    constructor(rank, file) {
        this.rank = rank;
        this.file = file;
        this.piece = null;
    } 
}

const CHESS = initialize();
const BOARD = state.chess.board;
const MOVELIST = state.chess.moves;
const WHITE = state.chess.players[0];
const BLACK = state.chess.players[1];

function initialize() {
    if(state.chess === undefined) {
        state.chess = new Chess();
    }
    return(state.chess);
}

//Removes all pieces from the board and ends the game.
function cleanup() {
    for(let i = 0; i < DIM_LIM; i++) {
        for(let j = 0; j < DIM_LIM; j++) {
            BOARD[i][j].piece = null;
        }
    }
    BOARD[DIM_LIM].length = 0;
    MOVELIST.length = 0;
    CHESS.moveNo = 0;
    CHESS.moveDrawCt = 0;
    CHESS.positions = {};
    CHESS.gameOn = false;
}

//Toggles whether a game is currently active.
function suspendResume(gameOn) {
    CHESS.gameOn = gameOn;
}

//Return all spaces that can be attacked by this piece, ignoring blocking pieces.
function allSightLines(piece) {
    let result = [];
    let rank = piece.rank;
    let file = piece.file;
    for(const line of getSightLines(piece)) {
        for(let i = 1; i <= line.dist; i++) {
            let newRank = rank + line.di * i;
            let newFile = file + line.dj * i;
            let inBounds = (0 <= newRank && newRank < DIM_LIM) && (0 <= newFile && newFile < DIM_LIM);
            if(!inBounds) {
                break;
            }
            result.push(BOARD[newRank][newFile]);
        }
    }
    return(result);
}

function boardToString() {
    let result = "";
    for(let i = DIM_LIM - 1; i >= 0; i--) {
        for(let j = 0; j < DIM_LIM ; j++) {
            let space = BOARD[i][j];
            result += spaceToString(space);
            if(j == DIM_LIM - 1) {
                result += "\n";
            } else {
                result += " ";
            }
        }
    }
    return(result);
}

//Is the [color] player allowed to castle? Return the C and G spaces if possible.
function castlingAvailable(color) {
    let king = locateKing(color);
    let result = [];
    if(king !== null) {
        let queenside = locateRook(color, 0, false);
        let kingside = locateRook(color, 7, false);
        if(queenside !== null) {
            result.push(queenside);
        }
        if(kingside !== null) {
            result.push(kingside);
        }
    }
    return(result);
}

function createBoard()
{
    let spaces = [];
    for(let i = 0; i < DIM_LIM; i++) {
        let rankArr = [];
        for(let j = 0; j < DIM_LIM; j++) {
            rankArr.push(new Space(i, j));
        }
        spaces.push(rankArr);
    }
    //"Rank 9" for captured pieces.
    spaces.push([]);
    return(spaces);
}

//Returns all legal moves of the [color] player.
function currentLegalMoves(color) {
    let result = {};
    let pieces = getPlayersPieces(color, false);
    for(const piece of pieces) {
        let moves = getLegalMoves(piece);
        if(moves.length > 0) {
            let space = getSpaceName(piece.rank, piece.file);
            let entries = [];
            for(const move of moves) {
                let dstRF = getRankFile(move);
                let bit = BOARD[dstRF[0]][dstRF[1]].piece === null ? 0 : 1;
                entries.push(new LegalEntry(move, bit));
            }
            result[space] = entries;
        }
    }
    //Remove moves if making them would put the king in check.
    for(const key of Object.keys(result)) {
        let rankFile = getRankFile(key);
        let srcSpace = BOARD[rankFile[0]][rankFile[1]];
        let value = result[key];
        for(let i = 0; i < value.length; i++) {
            let dstRF = getRankFile(value[i].dst);
            if(srcSpace.piece.type === "K") {
                let fileDiff = rankFile[1] - dstRF[1];
                if(fileDiff == 2 || fileDiff == -2) {
                    value[i].bits |= 4;
                }
            }
            let checks = wouldCheck(srcSpace.piece, dstRF[0], dstRF[1]);
            if(checks[0]) {
                value.splice(i, 1);
                i--;
            } else if(checks[1]) {
                value[i].bits |= 2;
            }
        }
        if(value.length == 0) {
            delete result[key];
        }
    }
    return(result);
}

function disambiguate(pieces, travel) {
    let eligible = [];
    let numPossible = pieces.length;
    for(let i = 0; i < pieces.length; i++) {
        eligible.push(true);
    }
    let srcFile = travel[0];
    let srcRank = travel[1];
    //disamb. by file
    if(srcFile >= 0) {
        for(let i = 0; i < pieces.length; i++) {
            if(eligible[i]) {
                if(pieces[i].file != srcFile) {
                    eligible[i] = false;
                    numPossible--;
                }
            }
        }
    }
    //disamb. by rank
    if(srcRank >= 0) {
        for(let i = 0; i < pieces.length; i++) {
            if(eligible[i]) {
                if(pieces[i].rank != srcRank) {
                    eligible[i] = false;
                    numPossible--;
                }
            }
        }
    }
    //disamb. by legal moves
    let dstFile = travel[2];
    let dstRank = travel[3];
    let player = pieces[0].color ? WHITE : BLACK;
    for(let i = 0; i < pieces.length; i++) {
        if(eligible[i]) {
            let piece = pieces[i];
            let found = false;
            let srcSpace = getSpaceName(piece.rank, piece.file);
            let spaces = player.legal[srcSpace];
            if(spaces === undefined) {
                eligible[i] = false;
                numPossible--;
            } else {
                for(const space of spaces) {
                    let rf = getRankFile(space.dst);
                    let match = (rf[0] == dstRank) && (rf[1] == dstFile);
                    if(match) {
                        found = true;
                        break;
                    }
                }
                if(!found) {
                    eligible[i] = false;
                    numPossible--;
                }
            }
        }
    }
    if(numPossible < 1) {
        return("no such piece");
    } else if(numPossible == 1) {
        for(let i = 0; i < pieces.length; i++) {
            if(eligible[i]) {
                return(pieces[i]);
            }
        }
    } else {
        return("too many pieces");
    }
}

//Returns the space on which an en passant capture is possible, if any.
function enPassantPossible() {
    if(MOVELIST.length == 0) {
        return(null);
    }
    let lastMove = MOVELIST[MOVELIST.length - 1];
    if(lastMove.spec === 1) {
        let srcRF = getRankFile(lastMove.src);
        let dstRF = getRankFile(lastMove.dst);
        let rank = (srcRF[0] + dstRF[0]) / 2;
        let file = dstRF[1];
        return(BOARD[rank][file]);
    }
    return(null);
}

//Determines which castles to write in FEN output. Does not check for attacks restricting castling.
function fenCastleCheck() {
   let castles = "";
   let wKing = locateKing(true);
   let wqRook = locateRook(true, 0, true);
   let wkRook = locateRook(true, 7, true);
   let bKing = locateKing(false);
   let bqRook = locateRook(false, 0, true);
   let bkRook = locateRook(false, 7, true);
    if(wKing) {
        if(wkRook !== null) {
            castles += "K";
        }
        if(wqRook !== null) {
            castles += "Q";
        }
    }
    if(bKing) {
        if(bkRook !== null) {
            castles += "k";
        }
        if(bqRook !== null) {
            castles += "q";
        }
    }
    if(castles.length == 0) {
        return("-");
    }
    return(castles);
}

function getDisambString(srcFile, srcRank) {
    let result = "";
    if(srcFile >= 0) {
        result += String.fromCharCode(srcFile + CHAR_a);
    }
    if(srcRank >= 0) {
        result += String.fromCharCode(srcRank + CHAR_1);
    }
    return(result);
}

function getFEN(posOnly) {
    let fen = "";
    //Part 1: piece positions
    for(let i = DIM_LIM - 1; i >= 0; i--) {
        let empty = 0;
        for(let j = 0; j < DIM_LIM; j++) {
            let space = BOARD[i][j];
            if(space.piece === null) {
                empty++;
            } else {
                if(empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                fen += getPieceChar(space.piece);
            }
        }
        if(empty > 0) {
            fen += empty;
        }
        let rankSep = i == 0 ? " " : "/";
        fen += rankSep;
    }
    //Part 2: White/Black to play
    let toPlay = CHESS.moveNo % 2 == 0 ? "w " : "b ";
    fen += toPlay;
    //Part 3: Castling
    fen += fenCastleCheck() + " ";
    //Part 4: En Croissant
    if(MOVELIST.length == 0) {
        fen += "- ";
    } else {
        let lastMove = MOVELIST[MOVELIST.length - 1];
        if(lastMove.spec === 1) {
            let srcRF = getRankFile(lastMove.src);
            let dstRF = getRankFile(lastMove.dst);
            let epRank = (srcRF[0] + dstRF[0]) / 2;
            fen += getSpaceName(epRank, dstRF[1]) + " ";
        } else {
            fen += "- ";
        }
    }
    if(!posOnly) {
        //Part 5: Move clocks
        fen += CHESS.moveDrawCt + " ";
        fen += (Math.trunc(CHESS.moveNo / 2) + 1);
    }
    return(fen);
}

function getLegalMoves(piece) {
    let result;
    switch(piece.type) {
        case "K":
            result = pieceMoves(piece);
            result = result.concat(castlingAvailable(piece.color))
            break;
        case "P":
            result = pawnMoves(piece);
            result = result.concat(pawnAttacks(piece));
            break;
        default: //Q, R, B, N
            result = pieceMoves(piece);
    }
    return(result);
}

function getPieceChar(piece) {
    let result = piece.type;
    if(!piece.color) {
        result = result.toLowerCase();
    }
    return(result);
}

function getPlayersPieces(color, kingOnly) {
    let pieces = []
    for(let i = 0; i < DIM_LIM; i++) {
        for(let j = 0; j < DIM_LIM; j++) {
            let piece = BOARD[i][j].piece;
            if(piece !== null) {
                if(piece.color == color) {
                    if(kingOnly) {
                        if(piece.type === "K") {
                            pieces.push(piece);
                            return(pieces);
                        }
                    } else {
                        pieces.push(piece);
                    }
                }
            }
        }
    }
    return(pieces);
}

function getRankFile(spaceName) {
    if(spaceName.length < 2) {
        return([-1, -1]);
    }
    let c0 = spaceName.charAt(0);
    let c1 = spaceName.charAt(1);
    let file = validFile(c0);
    let rank = validRank(c1);
    if(file >= 0 && rank >= 0) {
        return([rank, file]);
    } else {
        return([-1, -1]);
    }
}

function getSightLines(piece) {
    let result = [];
    switch(piece.type) {
        case "P":
            let di = piece.color ? 1 : -1;
            result.push(new SightLine(di, 1, 1));
            result.push(new SightLine(di, -1, 1));
            break;
        case "N":
            result.push(new SightLine(2, 1, 1));
            result.push(new SightLine(1, 2, 1));
            result.push(new SightLine(-1, 2, 1));
            result.push(new SightLine(-2, 1, 1));
            result.push(new SightLine(-2, -1, 1));
            result.push(new SightLine(-1, -2, 1));
            result.push(new SightLine(1, -2, 1));
            result.push(new SightLine(2, -1, 1));
            break;
        case "B":
            result.push(new SightLine(1, 1, DIM_LIM));
            result.push(new SightLine(-1, 1, DIM_LIM));
            result.push(new SightLine(-1, -1, DIM_LIM));
            result.push(new SightLine(1, -1, DIM_LIM));
            break;
        case "R":
            result.push(new SightLine(1, 0, DIM_LIM));
            result.push(new SightLine(0, 1, DIM_LIM));
            result.push(new SightLine(-1, 0, DIM_LIM));
            result.push(new SightLine(0, -1, DIM_LIM));
            break;
        case "Q":
            result.push(new SightLine(1, 1, DIM_LIM));
            result.push(new SightLine(-1, 1, DIM_LIM));
            result.push(new SightLine(-1, -1, DIM_LIM));
            result.push(new SightLine(1, -1, DIM_LIM));
            result.push(new SightLine(1, 0, DIM_LIM));
            result.push(new SightLine(0, 1, DIM_LIM));
            result.push(new SightLine(-1, 0, DIM_LIM));
            result.push(new SightLine(0, -1, DIM_LIM));
            break;
        case "K":
            result.push(new SightLine(1, 1, 1));
            result.push(new SightLine(-1, 1, 1));
            result.push(new SightLine(-1, -1, 1));
            result.push(new SightLine(1, -1, 1));
            result.push(new SightLine(1, 0, 1));
            result.push(new SightLine(0, 1, 1));
            result.push(new SightLine(-1, 0, 1));
            result.push(new SightLine(0, -1, 1));
            break;
    }
    return(result);
}

function getSpaceName(rank, file) {
    let result = "";
    let char = CHAR_a + file;
    result += String.fromCharCode(char);
    result += (rank + 1).toString();
    return(result);
}

//Returns the Jenkins OAAT hash code of the given FEN string.
function hashPosition(str) {
    let hash = 0;
    for(let i = 0; i < str.length; i++) {
        hash += str.charCodeAt(i);
        hash += hash << 10;
        hash ^= hash >> 6;
    }
    hash += hash << 3;
    hash ^= hash >> 11;
    hash += hash << 15;
    return(hash.toString(16));
}

//What pieces are checking the [color] player's king?
function inCheck(color) {
    let king = getPlayersPieces(color, true)[0];
    let enemies = getPlayersPieces(!color, false);
    let result = [];
    for(const piece of enemies) {
        if(piece.rank < DIM_LIM) {
            if(spaceUnderAttack(piece, king.rank, king.file)) {
                result.push(piece);
            }
        }
    }
    return(result);
}

function legalToString() {
    let whiteToPlay = CHESS.moveNo % 2 == 0;
    let player = whiteToPlay ? WHITE : BLACK;
    let legal = player.legal;
    let result = player.name + "'s legal moves are:";
    let ct = 0;
    for(const srcSpace of Object.keys(legal)) {
        let srcRF = getRankFile(srcSpace);
        let piece = BOARD[srcRF[0]][srcRF[1]].piece;
        let value = legal[srcSpace];
        result += "\n" + pieceToString(piece, false) + ": ";
        for(let i = 0; i < value.length; i++) {
            ct++;
            result += value[i].dst;
            if(value[i].bits > 0) {
                result += " (";
                let spec = [];
                if(value[i].bits & 4) {
                    spec.push("castle");
                }
                if(value[i].bits & 1) {
                    spec.push("capture");
                }
                if(value[i].bits & 2) {
                    spec.push("check");
                }
                result += spec.join(", ") + ")";
            }
            if(i < value.length - 1) {
                result += ", ";
            } else {
                result += ".";
            }
        }
    }
    if(ct == 0) {
        result += " None.";
    }
    return(result);
}

//Returns the king if the king is in the starting space and has not moved.
function locateKing(color) {
    let backRank = color ? 0 : 7;
    let space = BOARD[backRank][4];
    let piece = space.piece
    if(piece === null) {
        return(null);
    }
    if(piece.type !== "K" || piece.color != color || !piece.canCastle) {
        return(null)
    }
    return(space.piece);
}

//Return the space to which the king would move if castling in this direction is possible.
//Call with fen == true to ignore pieces and attacks.
function locateRook(color, file, fen) {
    let backRank = color ? 0 : 7;

    //Check if the corner space contains an ally rook that has not yet moved
    let space = BOARD[backRank][file];
    let piece = space.piece;
    if(piece === null) {
        return(null);
    }
    if(piece.type !== "R" || piece.color != color || !piece.canCastle) {
        return(null)
    }
    let df = file < 4 ? -1 : 1;
    if(!fen) {
        //Check if spaces between king and rook are empty
        
        for(let i = 4 + df; i != file; i += df) {
            space = BOARD[backRank][i];
            if(space.piece !== null) {
                return(null);
            }
        }
        for(let i = 0; i < DIM_LIM; i++) {
            for(let j = 0; j < DIM_LIM; j++) {
                if(BOARD[i][j].piece !== null) {
                    let piece = BOARD[i][j].piece;
                    if(piece.color != color) {
                        let kingAttacked = spaceUnderAttack(piece, backRank, 4);
                        let space1Attacked = spaceUnderAttack(piece, backRank, 4 + df);
                        let space2Attacked = spaceUnderAttack(piece, backRank, 4 + 2 * df);
                        if(kingAttacked || space1Attacked || space2Attacked) {
                            return(null);
                        }
                    }
                }
            }
        }
    }
    return(getSpaceName(backRank, 4 + 2 * df));
}

//Move piece from its current position to destination
function makeMove(piece, travel) {
    let dstFile = travel[2];
    let dstRank = travel[3];
    let dst = getSpaceName(dstRank, dstFile);
    let dstSpace = BOARD[dstRank][dstFile];
    let occupant = dstSpace.piece;
    let moveID = CHESS.moveNo;
    let src = getSpaceName(piece.rank, piece.file);
    let srcSpace = BOARD[piece.rank][piece.file];
    let disamb = getDisambString(travel[0], travel[1]);
    let special = null;
    let draw = CHESS.moveDrawCt;
    if(piece.type === "P") {
        CHESS.moveDrawCt = -1;
        if(dstRank == 0 || dstRank == 7) {
            special = promotionHandler(travel[4]);
        }
        let rankDiff = dstRank - piece.rank;
        switch(rankDiff) {
            case 2:
            case -2:
                special = 1;
                break;
        }
        let fileDiff = dstFile - piece.file;
        switch(fileDiff) {
            case 1:
            case -1:
                if(dstSpace.piece === null) {
                    //En croissant!
                    occupant = BOARD[piece.rank][dstFile].piece;
                    BOARD[piece.rank][dstFile].piece = null;
                    special = 4;
                }
        }
    }
    if(piece.type === "K") {
        switch(travel[4]) {
            case 2:
            case 3:
                special = travel[4];
                break;
        }
    }
    let move = new Move(moveID, piece, src, dst, disamb, occupant, special, draw);
    //Space occupied, perform capture
    if(occupant !== null) {
        occupant.rank = DIM_LIM;
        occupant.file = BOARD[DIM_LIM].length;
        BOARD[DIM_LIM].push(occupant);
        CHESS.moveDrawCt = -1;
    }
    switch(special) {
        case "B":
        case "N":
        case "R":
        case "Q":
            piece.type = special;
            break;
        case 2: //Kingside castle, move rook from H to F file
        case 3: //Queenside castle, move rook from A to D file
            let backRank = piece.color ? 0 : 7;
            let origRookFile = special == 2 ? 7 : 0;
            let newRookFile = special == 2 ? 5 : 3;
            let origRookSpace = BOARD[backRank][origRookFile];
            let newRookSpace = BOARD[backRank][newRookFile];
            let rook = origRookSpace.piece;
            rook.file = newRookFile;
            origRookSpace.piece = null;
            newRookSpace.piece = rook;
            break;
    }
    srcSpace.piece = null;
    dstSpace.piece = piece;
    piece.rank = dstRank;
    piece.file = dstFile;
    if(piece.canCastle) {
        if(special === null) {
            move.spec = 5;
        }
        piece.canCastle = false;
    }
    return(move);
}

function matchingPieces(pieces, name) {
    result = [];
    for(let i = 0; i < pieces.length; i++) {
        let piece = pieces[i];
        if(piece.type === name) {
            if(piece.rank < DIM_LIM) {
                result.push(piece);
            }
        }
    }
    return(result);
}

/* MoveStr passed in PGN style (Nxe5)
Return 0 if move is successful
Return 1 for bad formatting
Return 2 for no available piece
Return 3 if disambiguation is needed
Return 4 for invalid destination */
function moveHelper(moveStr) {
    if(moveStr.length < 2) {
        return(1);
    }
    
    let chars = moveStr.split("");
    let pieceName = parsePiece(chars);
    if(pieceName === null) {
        return(1);
    }
    //[srcFile, srcRank, dstFile, dstRank, special];
    let travel;
    let whiteToPlay = CHESS.moveNo % 2 == 0;
    if(pieceName === "O") {
        let backRank = whiteToPlay ? 0 : 7;
        let castleOs = parseCastle(chars);
        if(castleOs < 0) {
            return(1);
        }
        let dstFile = castleOs == 2 ? 6 : 2;
        travel = [-1, -1, dstFile, backRank, castleOs];
        pieceName = "K";
    } else {
        travel = parseSquares(chars);
    }
    if(travel[2] < 0 || travel[3] < 0) {
        return(1);
    }
    let playersPieces = getPlayersPieces(whiteToPlay, false);
    let matches = matchingPieces(playersPieces, pieceName);
    if(matches.length == 0) {
        return(2);
    }
    let piece;
    if(matches.length == 1) {
        piece = matches[0]
    } else {
        piece = disambiguate(matches, travel);
        if(piece === "no such piece") {
            return(2);
        } else if(piece === "too many pieces") {
            return(3);
        }
    }
    let move = makeMove(piece, travel)
    if(move === null) {
        return(4);
    }
    MOVELIST.push(move);
    CHESS.moveNo++; 
    let checkers = inCheck(!piece.color);
    let opp = piece.color ? BLACK : WHITE;
    opp.legal = currentLegalMoves(!piece.color);
    if(checkers.length > 0) {
        if(Object.keys(opp.legal).length > 0) {
            move.check = 1; //check
        } else {
            move.check = 2; //checkmate
            CHESS.gameOn = false;
        }
    } else {
        if(Object.keys(opp.legal).length == 0) {
            move.check = 3; //stalemate
            CHESS.gameOn = false;
        }
    }
    //Check for sufficient material
    if(!sufficientMaterial()) {
        move.check = 4;
        CHESS.gameOn = false;
    }
    //Check for three-peat draws
    let hash = hashPosition(getFEN(true));
    move.hash = hash;
    if(hash in CHESS.positions) {
        CHESS.positions[hash]++;
        if(CHESS.positions[hash] >= 3) {
            move.check = 5;
            CHESS.gameOn = false;
        }
    } else {
        CHESS.positions[hash] = 1;
    }
    //50-move draw
    CHESS.moveDrawCt++;
    if(CHESS.moveDrawCt >= 100) {
        move.check = 6;
        CHESS.gameOn = false;
    }
    return(0);
}

function movesToPGN() {
    let result = "";
    let final = MOVELIST.length - 1;
    for(let i = 0; i < MOVELIST.length; i++) {
        let move = MOVELIST[i];
        if(i % 2 == 0) {
            let id = Math.trunc(move.id / 2) + 1;
            result += id + ". ";
        }
        result += moveToString(move);
        if(i < final) {
            result += " ";
        }
    }
    return(result);
}

function moveToString(move) {
    let result = "";
    let piece = move.piece;
    let srcRF = getRankFile(move.src);
    let dstRF = getRankFile(move.dst);
    if(move.spec === -1) {
        return("...");
    } else if(move.spec === 2) {
        result += "O-O";
    } else if(move.spec === 3) {
        result += "O-O-O";
    } else {
        if(piece === "P") {
            result += String.fromCharCode(srcRF[1] + CHAR_a);
            if(move.cap === null) {
                result += String.fromCharCode(dstRF[0] + CHAR_1);
            } else {
                result += "x" + getSpaceName(dstRF[0], dstRF[1]);
            }
            switch(move.spec) {
                case "Q":
                case "R":
                case "B":
                case "N":
                    result += "=" + move.spec;
                    break;
            }
        } else {
            result += piece + move.disamb;
            if(move.cap !== null) {
                result += "x";
            }
            result += getSpaceName(dstRF[0], dstRF[1]);
        }
    }
    switch(move.check) {
        case 1:
            result += "+";
            break;
        case 2:
            result += "#";
            if(move.id % 2 == 0) {
                result += " 1-0";
            } else {
                result += " 0-1";
            }
            break;
        case 3:
        case 4:
        case 5:
        case 6:
            result += " 1/2-1/2";
            break;
    }
    return(result);
}

function parseCastle(chars) {
    let oCount = 0;
    for(c of chars) {
        switch(c) {
            case "O":
            case "o":
            case "0":
                oCount++;
                break;
        }
        if(oCount == 3) {
            return(3);
        }
    }
    switch(oCount) {
        case 2:
        case 3:
            return(oCount);
        default:
            return(-1);
    }
}

function parsePiece(chars) {
    if(validFile(chars[0]) >= 0) {
        return("P");
    } else {
        switch(chars[0]) {
            case "B":
            case "N":
            case "R":
            case "Q":
            case "K":
                return(chars[0]);
            case "O":
            case "o":
            case "0":
                return("O");
            default:
                return(null);
        }
    }
}

//Populates one rank of the board according to FEN input.
function parseRankFEN(rank, str, castles) {
    let idx = 0;
    let chars = str.split("");
    for(let i = 0; i < chars.length; i++) {
        let c = chars[i].charCodeAt(0);
        let isNum = CHAR_1 <= c && c <= CHAR_8;
        let isUpper = CHAR_A <= c && c <= CHAR_Z;
        let isLower = CHAR_a <= c && c <= CHAR_z;
        if(isNum) {
            //Empty spaces, advance idx
            idx += c - CHAR_1 + 1;
        } else if(isUpper || isLower) {
            let pieceType = chars[i].toUpperCase();
            let backRank = isUpper ? rank == 0 : rank == 7;
            let cast = false;
            if(backRank) {
                let startKing = pieceType === "K" && idx == 4;
                let startQRook = pieceType === "R" && idx == 0;
                let startKRook = pieceType === "R" && idx == 7;
                let castleStr = isUpper ? "KQ" : "kq";
                let castleQ = castles.includes(castleStr.charAt(1));
                let castleK = castles.includes(castleStr.charAt(0));
                cast = (castleQ && startQRook) || (castleK && startKRook) || ((castleQ || castleK) && startKing);
            }
            BOARD[rank][idx].piece = new Piece(isUpper, pieceType, rank, idx, cast && backRank);
            idx++;
        }
        if(idx >= DIM_LIM) {
            break;
        }
    }
}

function parseSquares(chars) {
    //[srcFile, srcRank, dstFile, dstRank, special];
    let travel = [-1, -1, -1, -1, null];
    let tIndex = 4;
    let r, f;
    for(let i = chars.length - 1; i >= 0; i--) {
        let c = chars[i];
        switch(tIndex) {
            case 4:
                //Can be number or piece name for promotion
                r = validRank(c);
                if(r >= 0) {
                    travel[3] = r;
                    tIndex -= 2;
                } else {
                    switch(c) {
                        case "Q":
                        case "R":
                        case "B":
                        case "N":
                            travel[4] = c;
                            tIndex--;
                            break;
                    }
                }
                break;
            case 3:
                //Need number
                r = validRank(c);
                if(r >= 0) {
                    travel[3] = r;
                    tIndex--;
                }
                break;
            case 2:
                //Need letter
                f = validFile(c);
                if(f >= 0) {
                    travel[2] = f;
                    tIndex--;
                }
                break;
            case 1:
                //Can be number or letter
                r = validRank(c);
                f = validFile(c);
                if(r >= 0) {
                    travel[1] = r;
                    tIndex--;
                } else if(f >= 0) {
                    travel[0] = f;
                    return(travel);
                }
                break;
            case 0:
                //Need letter
                f = validFile(c);
                if(f >= 0) {
                    travel[0] = f;
                    tIndex--;
                    return(travel);
                }
                break;
        }
        if(tIndex < 0) {
            break;
        }
    }
    return(travel);
}

//Can the pawn take diagonally?
function pawnAttacks(piece) {
    let result = [];
    let rank = piece.rank;
    let file = piece.file;
    let color = piece.color;
    let di = color ? 1 : -1;
    let epSpace = enPassantPossible();
    let space;
    if(file < DIM_LIM - 1) {
        space = BOARD[rank + di][file + 1];
        if(space.piece !== null) {
            if(space.piece.color != color) {
                result.push(getSpaceName(rank + di, file + 1));
            }
        } else if(spaceEquals(space, epSpace) == 0) {
            result.push(getSpaceName(rank + di, file + 1));
        }
    }
    if(file > 0) {
        space = BOARD[rank + di][file - 1];
        if(space.piece !== null) {
            if(space.piece.color != color) {
                result.push(getSpaceName(rank + di, file - 1));
            }
        } else if(spaceEquals(space, epSpace) == 0) {
            result.push(getSpaceName(rank + di, file - 1));
        }
    }
    return(result);
}

//Can the pawn move forward?
function pawnMoves(piece) {
    let result = [];
    let rank = piece.rank;
    let file = piece.file;
    let color = piece.color;
    let startRank = color ? 1 : 6;
    let di = color ? 1 : -1;
    let space = BOARD[rank + di][file];
    if(space.piece === null) {
        result.push(getSpaceName(rank + di, file));
    } else {
        return(result);
    }
    if(rank == startRank) {
        space = BOARD[rank + 2 * di][file]
        if(space.piece === null) {
            result.push(getSpaceName(rank + 2 * di, file));
        }
    }
    return(result);
}

function pieceEquals(piece1, piece2) {
    if(piece1.color != piece2.color) {
        return(piece1.color - piece2.color);
    }
    if(piece1.rank != piece2.rank) {
        return(piece1.rank - piece2.rank);
    }
    if(piece1.file != piece2.file) {
        return(piece1.file - piece2.file);
    }
    let value1 = pieceValue(piece1);
    let value2 = pieceValue(piece2);
    return(value1 - value2);
}

function pieceMoves(piece) {
    let result = [];
    for(line of getSightLines(piece)) {
        result = result.concat(sightLineMoves(piece, line));
    }
    return(result);
}

//Return all pieces seen in a given sightline.
function piecesInSight(piece, line) {
    let result = [];
    let rank = piece.rank;
    let file = piece.file;
    let color = piece.color
    for(let i = 1; i <= line.dist; i++) {
        let newRank = rank + line.di * i;
        let newFile = file + line.dj * i;
        let inBounds = (0 <= newRank && newRank < DIM_LIM) && (0 <= newFile && newFile < DIM_LIM);
        if(!inBounds) {
            return(result);
        }
        let space = BOARD[newRank][newFile];
        if(space.piece !== null) {
            result.push(space.piece);
        }
    }
    return(result);
}

function pieceToString(piece, printColor) {
    let result = "";
    if(printColor) {
        let colorStr = piece.color ? "White " : "Black ";
        result += colorStr;
    }
    let typeStr;
    switch(piece.type) {
        case "K":
            typeStr = "King";
            break;
        case "Q":
            typeStr = "Queen";
            break;
        case "B":
            typeStr = "Bishop";
            break;
        case "N":
            typeStr = "Knight";
            break;
        case "R":
            typeStr = "Rook";
            break;
        default:
            typeStr = "Pawn";
    }
    result += typeStr;
    if(piece.rank == DIM_LIM) {
        result += ": Captured";
    } else {
        result += " on " + getSpaceName(piece.rank, piece.file);
    }
    return(result);
}

function pieceValue(type) {
    switch(type) {
        case "P":
            return(10);
        case "N":
            return(32);
        case "B":
            return(33);
        case "R":
            return(50);
        case "Q":
            return(90);
        case "K":
            return(100000);
        default:
            return(0);
    }
}

function playerToString(color) {
    let player = color ? WHITE : BLACK;
    let result = player.name;
    result += "'s pieces are: ";
    let pieces = getPlayersPieces(color, false);
    for(let i = 0; i < pieces.length; i++) {
        let piece = pieces[i];
        result += pieceToString(piece, false);
        if(i < pieces.length - 1) {
            result += ", ";
        } else {
            result += ".";
        }
    }
    return(result);
}

//Takes in a FEN string and turns it into a playable board state.
function positionFromFEN(argv) {
    if(argv.length < 8) {
        return(null);
    }
    let parts = argv.slice(2);
    let ranks = parts[0].split("/");
    if(ranks.length < DIM_LIM) {
        return(null);
    }
    let toMove = parts[1] === "w";
    let castles = parts[2];
    let epSpace = parts[3];
    let drawCt = parseInt(parts[4], 10);
    let moveNo = parseInt(parts[5], 10);
    BOARD[DIM_LIM].length = 0;
    MOVELIST.length = 0;
    for(let i = 0; i < DIM_LIM; i++) {
        for(let j = 0; j < DIM_LIM; j++) {
            BOARD[i][j].piece = null;
        }
    }
    for(let i = 0; i < DIM_LIM; i++) {
        parseRankFEN(7 - i, ranks[i], castles);
    }
    CHESS.moveDrawCt = drawCt;
    CHESS.moveNo = (moveNo - 1) * 2 + !toMove;
    let dummyMove = toMove != (epSpace === "-");
    if(dummyMove) {
        //Black moves first, or White is able to capture en croissant.
        let offset = toMove ? -2 : -1;
        let dummyPiece = new Piece(true, "...", -1, -1, true);
        let move = new Move(CHESS.moveNo + offset, dummyPiece, "z9", "z9", "", null, -1, -1);
        MOVELIST.push(move);
    }
    if(epSpace !== "-") {
        //Insert a pawn move to allow the en croissant capture.
        let epRF = getRankFile(epSpace);
        let dummyPiece = new Piece(!toMove, "P", -1, -1, true);
        let rankDiff = toMove ? 1 : -1;
        let srcSpace = getSpaceName(epRF[0] + rankDiff, epRF[1]);
        let dstSpace = getSpaceName(epRF[0] - rankDiff, epRF[1]);
        let move = new Move(CHESS.moveNo - 1, dummyPiece, srcSpace, dstSpace, "", null, 1, -1);
        MOVELIST.push(move);
    }
    WHITE.legal = currentLegalMoves(true);
    BLACK.legal = currentLegalMoves(false);
    CHESS.gameOn = true;
    return(1);
}

function promotionHandler(promotion) {
    switch(promotion) {
        case "R":
        case "B":
        case "N":
            return(promotion);
    }
    return("Q");
}

function resetBoard(chess) {
    for(let i = 0; i < DIM_LIM; i++) {
        for(let j = 0; j < DIM_LIM ; j++) {
            BOARD[i][j].piece = null;
        }
    }
    BOARD[DIM_LIM].length = 0;
    chess.moves.length = 0;
    chess.moveNo = 0;
    chess.moveDrawCt = 0;
    chess.positions = {};
    startingPosition(true);
    startingPosition(false);
    chess.players[0].legal = currentLegalMoves(true);
    chess.players[1].legal = currentLegalMoves(false);
    chess.gameOn = true;
}

function setPlayerName(argv) {
    let color = argv[1] === "white";
    let player = color ? WHITE : BLACK;
    let name;
    if(argv.length >= 3) {
        name = argv.slice(2).join(" ");
    } else {
        name = color ? "White" : "Black";
    }
    player.name = name;
}

//Get all spaces reachable by travelling in the direction specified by [line].
function sightLineMoves(piece, line) {
    let result = []
    let rank = piece.rank;
    let file = piece.file;
    let color = piece.color
    for(let i = 1; i <= line.dist; i++) {
        let newRank = rank + line.di * i;
        let newFile = file + line.dj * i;
        let inBounds = (0 <= newRank && newRank < DIM_LIM) && (0 <= newFile && newFile < DIM_LIM);
        if(!inBounds) {
            return(result);
        }
        let space = BOARD[newRank][newFile];
        if(space.piece === null) {
            result.push(getSpaceName(newRank, newFile));
        } else if(space.piece.color == color) {
            return(result);
        } else {
            result.push(getSpaceName(newRank, newFile));
            return(result);
        }
    }
    return(result);
}

function spaceEquals(space1, space2) {
    if(space1 === null) {
        return(-999);
    }
    if(space2 === null) {
        return(999);
    }
    let rankDiff = space1.rank - space2.rank;
    let fileDiff = space1.file - space2.file;
    return(rankDiff * 8 + fileDiff);
}

function spaceToString(space) {
    if(space.piece == null) {
        return(".")
    } else {
        return(getPieceChar(space.piece));
    }
}

//Is [piece] capable of capturing on this square?
function spaceUnderAttack(piece, rank, file) {
    let space = BOARD[rank][file];
    let spacesSeen = allSightLines(piece);
    if(spacesSeen.includes(space)) {
        switch(piece.type) {
            case "B":
            case "R":
            case "Q":
                //Long-distance pieces, check if space is reachable.
                let di = rank - piece.rank;
                let dj = file - piece.file;
                di = di == 0 ? 0 : di / Math.abs(di);
                dj = dj == 0 ? 0 : dj / Math.abs(dj);
                for(i = 1; i <= DIM_LIM; i++) {
                    let newRank = piece.rank + i * di;
                    let newFile = piece.file + i * dj;
                    if(newRank == rank && newFile == file) {
                        return(true);
                    }
                    let inBounds = (0 <= newRank && newRank < DIM_LIM) && (0 <= newFile && newFile < DIM_LIM);
                    if(!inBounds) {
                        return(false); //Impossible in theory
                    }
                    if(BOARD[newRank][newFile].piece !== null) {
                        return(false);
                    }
                }
                break;
            default:
                //Knight and pawn sightlines have distance multiplier 1.
                return(true);
        }
    return(false);
    }
}

function startingPosition(color) {
    let pieceRank = color ? 0 : 7;
    let pawnRank = color ? 1 : 6;
    let pieces = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    for(let i = 0; i < DIM_LIM; i++) {
        let piece = pieces[i];
        let castle = piece === "K" || piece === "R";
        BOARD[pieceRank][i].piece = new Piece(color, pieces[i], pieceRank, i, castle);
        BOARD[pawnRank][i].piece = new Piece(color, "P", pawnRank, i, false);
    }
}

//Are there enough pieces on the board that it's possible for the game to end in checkmate?
function sufficientMaterial() {
    let pieces = [];
    for(let i = 0; i < DIM_LIM; i++) {
        for(let j = 0; j < DIM_LIM; j++) {
            if(BOARD[i][j].piece !== null) {
                pieces.push(BOARD[i][j].piece);
            }
        }
    }
    if(pieces.length >= 4) {
        return(true);
    }
    for(const piece of pieces) {
        switch(piece.type) {
            case "P":
            case "R":
            case "Q":
                return(true);
        }
    }
    return(false);
}

//Put the rook back on its original square.
function undoCastle(piece, special) {
    let backRank = piece.color ? 0 : 7;
    let newRookFile = special == 2 ? 5 : 3;
    let oldRookFile = special == 2 ? 7 : 0;
    let rook = BOARD[backRank][newRookFile].piece;
    BOARD[backRank][oldRookFile].piece = rook;
    BOARD[backRank][newRookFile].piece = null;
    rook.file = oldRookFile;
    rook.canCastle = true;   
}

//Undo the most recent move.
function undoMove() {
    if(MOVELIST.length == 0) {
        return(null);
    }
    let lastMove = MOVELIST.pop();
    let dstRF = getRankFile(lastMove.dst);
    let srcRF = getRankFile(lastMove.src);
    let occupant = lastMove.cap;
    let piece = BOARD[dstRF[0]][dstRF[1]].piece;

    //Demote pawns
    switch(lastMove.spec) {
        case "Q":
        case "R":
        case "B":
        case "N":
            piece.type = "P";
            break;
    }
    BOARD[srcRF[0]][srcRF[1]].piece = piece;
    piece.rank = srcRF[0];
    piece.file = srcRF[1];
    //Restore castling rights
    switch(lastMove.spec) {
        case 2:
        case 3:
            undoCastle(piece, lastMove.spec);
            piece.canCastle = true;
            break;
        case 5:
            piece.canCastle = true;
            break;
    }

    //Restore captured piece
    if(occupant === null) {
        BOARD[dstRF[0]][dstRF[1]].piece = null;
    } else {
        let piece2 = BOARD[DIM_LIM].pop();
        if(lastMove.spec === 4) {
            //En croissant
            piece2.rank = srcRF[0];
            piece2.file = dstRF[1];
            BOARD[srcRF[0]][dstRF[1]].piece = piece2;
            BOARD[dstRF[0]][dstRF[1]].piece = null;
        } else {
            piece2.rank = dstRF[0];
            piece2.file = dstRF[1];
            BOARD[dstRF[0]][dstRF[1]].piece = piece2;
        }
    }

    //Remove last move from position history
    let hash = lastMove.hash;
    CHESS.positions[hash]--;
    if(CHESS.positions[hash] <= 0) {
        delete CHESS.positions[hash];
    }
    WHITE.legal = currentLegalMoves(true);
    BLACK.legal = currentLegalMoves(false);
    CHESS.moveNo--;
    CHESS.moveDrawCt = lastMove.draw;
    CHESS.gameOn = true;
    return(lastMove);
}

function validFile(fileStr) {
    let char0 = fileStr.charCodeAt(0);
    if(CHAR_a <= char0 && char0 <= CHAR_h) {
        return(char0 - CHAR_a);
    }
    return(-1);
}

function validRank(rankStr) {
    let char0 = rankStr.charCodeAt(0);
    if(CHAR_1 <= char0 && char0 <= CHAR_8) {
        return(char0 - CHAR_1);
    }
    return(-1);
}

//Would making this move put either king in check?
function wouldCheck(piece, dstRank, dstFile) {
    //save the game state
    let srcFile = piece.file;
    let srcRank = piece.rank;
    let srcSpace = BOARD[srcRank][srcFile];
    let dstSpace = BOARD[dstRank][dstFile];
    let occupant = dstSpace.piece;

    //make the move, then check
    if(occupant !== null) {
        occupant.rank = 8;
    }
    piece.rank = dstRank;
    piece.file = dstFile;
    dstSpace.piece = piece;
    srcSpace.piece = null;
    let allyCheck = inCheck(piece.color).length > 0;
    let enemyCheck = inCheck(!piece.color).length > 0;
    let result = [allyCheck, enemyCheck];
    //load the game state
    if(occupant !== null) {
        occupant.rank = dstRank;
    }
    dstSpace.piece = occupant;
    piece.rank = srcRank;
    piece.file = srcFile;
    srcSpace.piece = piece;
    return(result);
}

//AI Dungeon helper functions
const getPrevAction = () => history[history.length - 1];
const hasPrevAction = () => (history.length && (1 < getPrevAction().text?.trim().length));

function inputHandler() {
    let actionText = getPrevAction().text.trimStart();
    if(actionText.startsWith("/chess ")) {
        return(cmdHandler(actionText));
    }
}

function cmdHandler(inputStr) {
    let argv = inputStr.split(" ");
    let result;
    switch(argv[1]) {
        case "new":
        case "start":
        case "reset":
            resetBoard(state.chess);
            return("new");
        case "board":
        case "print":
            return("board");
        case "pgn":
        case "moves":
            return("pgn");
        case "legal":
            return("legal");
        case "white":
        case "black":
            setPlayerName(argv);
            return(argv[1]);
        case "push":
        case "add":
            result = pushHandler(argv);
            if(result[1] === "") {
                return("push " + result[0]);
            } else {
                let pluralStr = result[0] === 1 ? " move pushed" : " moves pushed";
                return(result[1] + ", " + result[0] + pluralStr);
            }
        case "pop":
        case "undo":
            result = popHandler(argv);
            if(result[1] === "") {
                return("pop  " + result[0]);
            } else {
                let pluralStr = result[0] === 1 ? " move undone" : " moves undone";
                return(result[1] + ", " + result[0] + pluralStr);
            }
        case "fen":
        case "pos":
        case "position":
            if(positionFromFEN(argv) === null) {
                return("bad format");
            } else {
                return("fen");
            }
        case "off":
        case "close":
            cleanup();
            return("off");
        case "suspend":
        case "pause":
        case "adjourn":
            suspendResume(false);
            return("suspend");
        case "resume":
        case "continue":
            suspendResume(true);
            return("resume");
        default:
            return("invalid command");
    }
}

function popHandler(argv) {
    let successCt = 0;
    let status = "";
    let tgt;
    if(argv[2] === undefined) {
        tgt = 1;
    } else {
        tgt = parseInt(argv[2], 10);
        if(isNaN(tgt)) {
            tgt = 1;
        }
    }
    for(let i = 0; i < tgt; i++) {
        let move = undoMove();
        if(move === null) {
            status = "move list empty";
            return([successCt, status]);
        } else {
            successCt++;
        }
    }
    return([successCt, status]);
}

function pushHandler(argv) {
    if(argv[2] === undefined) {
        return([0, "no move"]);
    }
    let successCt = 0;
    let status = "";
    for(let i = 2; i < argv.length; i++) {
        let moveStr = argv[i];
        if(moveStr === undefined) {
            status = "no move";
            break;
        }
        let statusCode = moveHelper(argv[i]);
        switch(statusCode) {
            case 0:
                successCt++;
                break;
            case 1:
                status = "bad format";
                break;
            case 2:
                status = "no available piece";
                break;
            case 3:
                status = "ambiguous";
                break;
            case 4:
                status = "illegal move";
                break;
        }
        if(status !== "") {
            break;
        }
    }
    return([successCt, status]);
}

