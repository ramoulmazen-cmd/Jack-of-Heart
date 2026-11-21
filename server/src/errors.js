/** A rule was broken. `code` is for programs, `message` is shown to the player. */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
