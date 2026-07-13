export class SecretValue {
  #value: string | undefined;

  private constructor(value: string) {
    this.#value = value;
  }

  public static create(value: string): SecretValue {
    return new SecretValue(value);
  }

  public use<TResult>(work: (value: string) => TResult): TResult {
    if (this.#value === undefined) {
      throw new Error("Secret value has already been destroyed.");
    }
    return work(this.#value);
  }

  public lastCharacters(length: number): string {
    return this.use((value) => value.slice(-length));
  }

  public destroy(): void {
    this.#value = undefined;
  }

  public toJSON(): string {
    return "[redacted]";
  }

  public toString(): string {
    return "[redacted]";
  }
}
