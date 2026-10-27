#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BondFilePicker, NSObject)
RCT_EXTERN_METHOD(pick:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(fetchOfficial:(NSString *)url resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
