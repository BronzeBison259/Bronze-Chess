const CARD_NAME = "BronzeChess Commands";
const CARD_TYPE = "Instructions";
const CARD_ENTRY = `To use the script's built-in chess board, you must enter the following commands as a Story input.

/chess new - Reset the board to starting position (Must initialize board before entering other commands)
/chess off - Clear the board and stop adding game info to context
/chess suspend - Stop adding game info to context without affecting the game state
/chess resume - Continue adding game info to context without affecting the game state
/chess white [name] - Set the name of the character with the white pieces (default name White)
/chess black [name] - Set the name of the character with the black pieces (default name Black)
/chess push [move1]... - Make moves on the board (PGN style, separated by spaces)
/chess pop [number] - Undo the last [number] moves made on the board
/chess legal - Print the current legal moves for the next player
/chess board - Print an ASCII representation of the current position, plus FEN (Hacker font for spacing)
/chess pgn - Print the current list of moves in PGN format
/chess fen [FEN] - Set the state of the board to match the given FEN string (Experimental)`;

const modifier = (text) => {
  //Create the instructions story card if it doesn't currently exist.
  let instrFound = false;
  for(const card of storyCards) {
    if(card.title === CARD_NAME) {
      instrFound = true;
      break;
    }
  }
  if(!instrFound) {
    addStoryCard(CARD_NAME, CARD_ENTRY, CARD_TYPE);
  }

  //Add game info to the context if a game is currently running.
  if(CHESS.gameOn) {
    let contextStart = ` There is currently an ongoing chess game between ${WHITE.name} and ${BLACK.name}.\n`;
    let whiteToMove = CHESS.moveNo % 2 == 0;
    let oppPieces = playerToString(!whiteToMove) + "\n"
    let chessContext = contextStart + oppPieces + legalToString();
    let newText = text + chessContext;
    return{text: newText};
  }
  return { text };
};

modifier(text);

