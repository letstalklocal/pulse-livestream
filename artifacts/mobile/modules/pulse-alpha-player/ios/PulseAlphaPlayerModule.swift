import ExpoModulesCore

public class PulseAlphaPlayerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PulseAlphaPlayer")
    Constants(["supportsMutedPlayback": true])
    View(PulseAlphaPlayerView.self) {
      Events("onFinish", "onError")
      Prop("source") { (view: PulseAlphaPlayerView, source: String) in
        view.setSource(source)
      }
      Prop("muted") { (view: PulseAlphaPlayerView, muted: Bool) in
        view.setMuted(muted)
      }
    }
  }
}

final class PulseAlphaPlayerView: ExpoView {
  let onFinish = EventDispatcher()
  let onError = EventDispatcher()
  private let host = PPAlphaPlayerHost(frame: .zero)
  private var source: String?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
    host.onFinish = { [weak self] in self?.onFinish([:]) }
    host.onError = { [weak self] message in self?.onError(["message": message]) }
    addSubview(host)
  }

  func setSource(_ value: String) {
    guard value != source else { return }
    source = value
    guard let url = URL(string: value), url.isFileURL else {
      host.stop()
      onError(["message": "AlphaPlayer: local MP4 required"])
      return
    }
    host.play(fileURL: url)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.frame = bounds
  }

  func setMuted(_ value: Bool) {
    host.isMuted = value
  }
}
