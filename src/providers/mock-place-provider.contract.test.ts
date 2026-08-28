import { mockPlaceProvider } from "./mock-place-provider";
import { runPlaceProviderContract } from "./place-provider.contract";

runPlaceProviderContract(() => mockPlaceProvider);
