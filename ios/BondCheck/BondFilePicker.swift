import UIKit
import UniformTypeIdentifiers
import React

@objc(BondFilePicker)
class BondFilePicker: NSObject, UIDocumentPickerDelegate {
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(fetchOfficial:resolver:rejecter:)
  func fetchOfficial(_ value: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let url = URL(string: value), OfficialDownload.allowed(url) else {
      reject("OFFICIAL_FETCH", "Only official HTTPS URLs are allowed", nil); return
    }
    OfficialDownload.start(url, resolve, reject)
  }

  @objc(pick:rejecter:)
  func pick(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.resolve == nil else { reject("PICKER_OPEN", "A file picker is already open", nil); return }
      guard let presenter = RCTPresentedViewController() else { reject("NO_ACTIVITY", "Open the app first", nil); return }
      self.resolve = resolve
      self.reject = reject
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
      picker.delegate = self
      picker.allowsMultipleSelection = false
      presenter.present(picker, animated: true)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    resolve?(nil)
    resolve = nil
    reject = nil
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else { documentPickerWasCancelled(controller); return }
    let finish = resolve
    let fail = reject
    resolve = nil
    reject = nil
    DispatchQueue.global(qos: .userInitiated).async {
      let scoped = url.startAccessingSecurityScopedResource()
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      do {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= 5 * 1024 * 1024 else { fail?("FILE_SIZE", "Choose a file up to 5 MB", nil); return }
        let data = try Data(contentsOf: url)
        guard data.count <= 5 * 1024 * 1024 else { fail?("FILE_SIZE", "Choose a file up to 5 MB", nil); return }
        finish?(["name": url.lastPathComponent, "base64": data.base64EncodedString()])
      } catch { fail?("FILE_READ", "Cannot read the selected file", error) }
    }
  }
}

private final class OfficialDownload: NSObject, URLSessionDataDelegate {
  private var data = Data()
  private var redirects = 0
  private var failure: String?
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock
  private let maximumBytes = 5 * 1024 * 1024

  private init(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
    self.resolve = resolve; self.reject = reject
  }
  static func allowed(_ url: URL) -> Bool {
    url.scheme == "https" && ["savings.gov.pk", "www.savings.gov.pk"].contains(url.host ?? "") &&
      url.user == nil && url.password == nil && (url.port == nil || url.port == 443)
  }
  static func start(_ url: URL, _ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock) {
    let delegate = OfficialDownload(resolve, reject)
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 20
    config.timeoutIntervalForResource = 20
    config.httpShouldSetCookies = false
    let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    var request = URLRequest(url: url)
    request.setValue("PrizeBondChecker/1.0 (personal use)", forHTTPHeaderField: "User-Agent")
    session.dataTask(with: request).resume()
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    redirects += 1
    guard redirects <= 3, let url = request.url, Self.allowed(url) else {
      failure = "Invalid or excessive official-site redirects"; completionHandler(nil); return
    }
    completionHandler(request)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
          response.expectedContentLength <= Int64(maximumBytes) else {
      failure = "Official download failed or exceeds 5 MB"; completionHandler(.cancel); return
    }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    guard data.count + chunk.count <= maximumBytes else {
      failure = "Official file exceeds 5 MB"; dataTask.cancel(); return
    }
    data.append(chunk)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer { session.finishTasksAndInvalidate() }
    if let failure = failure { reject("OFFICIAL_FETCH", failure, error) }
    else if let error = error { reject("OFFICIAL_FETCH", error.localizedDescription, error) }
    else { resolve(["base64": data.base64EncodedString()]) }
  }
}
