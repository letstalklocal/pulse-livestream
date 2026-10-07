#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
// Keep the third-party headers out of the Swift-facing public interface.
@interface PPAlphaPlayerHost : UIView
@property (nonatomic, copy, nullable) void (^onFinish)(void);
@property (nonatomic, copy, nullable) void (^onError)(NSString *message);
@property (nonatomic, assign, getter=isMuted) BOOL muted;
- (void)playFileURL:(NSURL *)url NS_SWIFT_NAME(play(fileURL:));
- (void)stop;
@end
NS_ASSUME_NONNULL_END
