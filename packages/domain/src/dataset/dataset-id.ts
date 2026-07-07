import { DomainError } from "../shared/domain-error";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DatasetId {
  private constructor(private readonly value: string) {}

  public static create(): DatasetId {
    return new DatasetId(crypto.randomUUID());
  }

  public static from(value: string): DatasetId {
    if (!uuidPattern.test(value)) {
      throw new DomainError("DATASET_ID_INVALID", "Dataset ID must be a valid UUID.");
    }

    return new DatasetId(value);
  }

  public toString(): string {
    return this.value;
  }
}
