#import "PPAlphaPlayerHost.h"
#import <BDAlphaPlayer/BDAlphaPlayerMetalView.h>
#import <AVFoundation/AVFoundation.h>
#import <MetalKit/MetalKit.h>

@interface PPAlphaPlayerHost () <BDAlphaPlayerMetalViewDelegate>
@property (nonatomic, strong) BDAlphaPlayerMetalView *alphaView;
@property (nonatomic, strong) AVPlayer *audioPlayer;
@property (nonatomic, strong) NSURL *resourceDirectory;
@property (nonatomic, assign) BOOL audioStarted;
@property (nonatomic, assign) BOOL observingAudio;
@property (nonatomic, assign) BOOL started;
@end

@implementation PPAlphaPlayerHost
- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.userInteractionEnabled = NO;
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(stop)
      name:UIApplicationWillResignActiveNotification object:nil];
  }
  return self;
}
- (void)dealloc {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self stop];
}
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (!self.window) [self stop];
}
- (void)fail:(NSString *)message {
  [self stop];
  if (self.onError) self.onError(message ?: @"AlphaPlayer: playback failed");
}
- (void)playFileURL:(NSURL *)url {
  [self stop];
  if (!url.isFileURL || ![NSFileManager.defaultManager fileExistsAtPath:url.path]) {
    [self fail:@"AlphaPlayer: local MP4 unavailable"]; return;
  }
  if (!MTLCreateSystemDefaultDevice()) { [self fail:@"AlphaPlayer: Metal unavailable"]; return; }
  NSError *error = nil;
  NSURL *directory = [[NSURL fileURLWithPath:NSTemporaryDirectory() isDirectory:YES]
    URLByAppendingPathComponent:[@"pulse-alpha-" stringByAppendingString:NSUUID.UUID.UUIDString] isDirectory:YES];
  self.resourceDirectory = directory;
  if (![NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&error]) {
    [self fail:error.localizedDescription]; return;
  }
  // AlphaPlayer requires a resource directory and config.json. A hard link avoids
  // duplicating the bundled movie when possible; copying is a safe fallback.
  NSURL *movie = [directory URLByAppendingPathComponent:@"video.mp4"];
  if (![NSFileManager.defaultManager linkItemAtURL:url toURL:movie error:nil] &&
      ![NSFileManager.defaultManager copyItemAtURL:url toURL:movie error:&error]) {
    [self fail:error.localizedDescription]; return;
  }
  NSDictionary *entry = @{ @"path": @"video.mp4", @"align": @1 }; // Aspect fit, not stretch/crop.
  NSData *json = [NSJSONSerialization dataWithJSONObject:@{ @"portrait": entry, @"landscape": entry } options:0 error:&error];
  if (!json || ![json writeToURL:[directory URLByAppendingPathComponent:@"config.json"] options:NSDataWritingAtomic error:&error]) {
    [self fail:error.localizedDescription]; return;
  }
  self.alphaView = [[BDAlphaPlayerMetalView alloc] initWithDelegate:self];
  self.alphaView.opaque = NO;
  for (UIView *child in self.alphaView.subviews) {
    child.opaque = NO;
    child.backgroundColor = UIColor.clearColor;
    if ([child isKindOfClass:MTKView.class]) ((MTKView *)child).clearColor = MTLClearColorMake(0, 0, 0, 0);
  }
  [self addSubview:self.alphaView];

  // Upstream AlphaPlayer only reads video. Use an audio-only composition so we
  // do not decode the movie twice or change Agora's shared AVAudioSession.
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:movie options:nil];
  AVAssetTrack *audioTrack = [asset tracksWithMediaType:AVMediaTypeAudio].firstObject;
  if (audioTrack) {
    AVMutableComposition *composition = [AVMutableComposition composition];
    AVMutableCompositionTrack *track = [composition addMutableTrackWithMediaType:AVMediaTypeAudio preferredTrackID:kCMPersistentTrackID_Invalid];
    if (![track insertTimeRange:audioTrack.timeRange ofTrack:audioTrack atTime:kCMTimeZero error:&error]) {
      [self fail:error.localizedDescription]; return;
    }
    self.audioPlayer = [AVPlayer playerWithPlayerItem:[AVPlayerItem playerItemWithAsset:composition]];
    self.audioPlayer.volume = 1.0;
    self.audioPlayer.actionAtItemEnd = AVPlayerActionAtItemEndPause;
    self.observingAudio = YES;
    [self.audioPlayer.currentItem addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:NULL];
  }
  [self setNeedsLayout];
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  if (object == self.audioPlayer.currentItem && [keyPath isEqualToString:@"status"]) {
    __weak PPAlphaPlayerHost *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      PPAlphaPlayerHost *host = weakSelf;
      if (!host || object != host.audioPlayer.currentItem) return;
      if (host.audioPlayer.currentItem.status == AVPlayerItemStatusFailed) [host fail:host.audioPlayer.currentItem.error.localizedDescription];
      else [host setNeedsLayout];
    });
  } else [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}
- (void)layoutSubviews {
  [super layoutSubviews];
  if (self.started || !self.window || !self.alphaView || CGRectIsEmpty(self.bounds)) return;
  if (self.audioPlayer && self.audioPlayer.currentItem.status != AVPlayerItemStatusReadyToPlay) return;
  self.started = YES;
  BDAlphaPlayerMetalConfiguration *config = [BDAlphaPlayerMetalConfiguration defaultConfiguration];
  config.directory = self.resourceDirectory.path;
  config.orientation = BDAlphaPlayerOrientationPortrait;
  config.renderSuperViewFrame = self.bounds;
  [self.alphaView playWithMetalConfiguration:config];
}
- (void)frameCallBack:(NSTimeInterval)duration {
  if (self.started && !self.audioStarted && self.audioPlayer) {
    self.audioStarted = YES;
    [self.audioPlayer play];
  }
}
- (void)metalView:(BDAlphaPlayerMetalView *)metalView didFinishPlayingWithError:(NSError *)error {
  // Queue completion out of the renderer's draw stack, and reject retired players.
  __weak PPAlphaPlayerHost *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    PPAlphaPlayerHost *host = weakSelf;
    if (!host || metalView != host.alphaView) return;
    [host stop];
    if (error) { if (host.onError) host.onError(error.localizedDescription); }
    else if (host.onFinish) host.onFinish();
  });
}
- (void)stop {
  if (self.observingAudio) {
    [self.audioPlayer.currentItem removeObserver:self forKeyPath:@"status"];
    self.observingAudio = NO;
  }
  [self.audioPlayer pause];
  [self.audioPlayer replaceCurrentItemWithPlayerItem:nil];
  self.audioPlayer = nil;
  [self.alphaView stop];
  [self.alphaView removeFromSuperview];
  self.alphaView = nil;
  self.started = NO;
  self.audioStarted = NO;
  if (self.resourceDirectory) [NSFileManager.defaultManager removeItemAtURL:self.resourceDirectory error:nil];
  self.resourceDirectory = nil;
}
@end
