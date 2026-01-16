const modifier = (text) => {
    let cmdVal = inputHandler();
    if(cmdVal !== undefined) {
        let newText = " " + cmdVal;
        if(cmdVal.startsWith("push")) {
            let lastMove = MOVELIST[MOVELIST.length - 1];
            switch(lastMove.check) {
                case 1:
                    return{text: " - Check!"};
                case 2:
                    return{text: " - Checkmate!"};
                case 3:
                    return{text: " - Stalemate!"};
                case 4:
                    return{text: " - Draw by insufficient material!"};
                case 5:
                    return{text: " - Draw by repetition!"};
                case 6:
                    return{text: " - 50-move draw!"};
            }
            switch(lastMove.spec) {
                case "Q":
                case "R":
                case "B":
                case "N":
                    return{text: " - Pawn promotion!"};
                case 2:
                    return{text: " - Kingside castle!"};
                case 3:
                    return{text: " - Queenside castle!"};
                case 4:
                    return{text: " - En passant!"};
                default:
                    return{text: " - Success!"};
            }
        } else if(cmdVal.startsWith("pop")) {
            return{text: " - Success!"};
        }
        switch(cmdVal) {
            case "new":
                return{text: " - Board reset!"};
            case "fen":
                return{text: " - Position loaded!"};
            case "white":
            case "black":
                return{text: " - Player name set!"};
            case "off":
                return{text: " - Chess game ended!"};
            case "suspend":
                return{text: " - Chess game adjourned!"};
            case "resume":
                return{text: " - Chess game resumed!"};
            case "board":
                newText = "\n" + boardToString() + getFEN(false) + "\n";
                return{text: newText};
            case "pgn":
                newText = "\n" + movesToPGN() + "\n";
                return{text: newText};
            case "legal":
                newText = "\n" + legalToString() + "\n";
                return{text: newText};
            default:
                return{text: newText};
        }
    }
    return{text};
};

modifier(text);
